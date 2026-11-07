import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { getEmojiForNumber } from "@/lib/animals";
import type { Game, Result, GameWithResults, AnimalImage, AnimalEntry } from "@/lib/types";
import {
  Clock,
  LogOut,
  Settings,
  RefreshCw,
  Hash,
  PawPrint,
  Repeat,
  Volume2,
  VolumeX,
  Sliders,
  Target,
  KeyRound,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useBoardSettings } from "@/context/BoardSettingsContext";
import { useLicenseContext } from "@/components/LicenseGate";
import TriplesBoard from "@/components/TriplesBoard";
import {
  TRIPLE_GAMES,
  buildTripleAlertItem,
  type TripleGameConfig,
  type TripleResult,
} from "@/lib/triples";
import AdBanner, { AdTickerBar } from "@/components/AdBanner";
import ResultAlertModal, { type ResultAlertItem } from "@/components/ResultAlertModal";
import VoiceSettingsModal from "@/components/VoiceSettingsModal";
import AnimalMedia from "@/components/AnimalMedia";
import { lotteryDate, LOTTERY_TIMEZONE } from "@/lib/lottery-date";
import { useDisplay } from "@/context/DisplayContext";
import { sorteoAlertTracker, getSorteoAlertKey } from "@/lib/sorteo-alert-tracker";
import { getGameScheduleTimes } from "@/lib/game-schedules";
import { resolveCanonicalAnimal } from "@/lib/official-animals";
import { getResponsiveBoardGridStyle, DEFAULT_CARDS_PER_SCREEN } from "@/lib/license-lotteries";
import {
  mergeAnimalImagesPreserveCustom,
  recoverCustomAnimalImagesFromLocalStorage,
  isDefaultCatalogImageUrl,
} from "@/lib/mock-db";

interface BoardPageProps {
  onAdminClick: () => void;
}

type AnimalImageMap = Record<string, string>;
type AnimalNameMap = Record<string, string>;
type AnimalLabelMap = Record<string, string>;

function resolveAlertWithAnimalImage(
  item: ResultAlertItem,
  imgMap: AnimalImageMap,
  gamesList: Game[],
): ResultAlertItem {
  if (item.id?.startsWith("triple-")) {
    return item;
  }
  const gameObj = gamesList.find(
    (g) =>
      g.id === item.gameId ||
      g.slug === item.gameId ||
      (item.gameName && g.name.toLowerCase() === item.gameName.toLowerCase()),
  );
  const gameKey = gameObj?.slug || gameObj?.id || item.gameId;
  const canonical = resolveCanonicalAnimal(
    gameKey,
    item.animalLabel ?? item.animalNumber,
    item.animalName,
    imgMap,
  );
  const resolvedUrl =
    imgMap[`${item.gameId}:${canonical.number}`] ??
    (gameObj ? imgMap[`${gameObj.id}:${canonical.number}`] : undefined) ??
    (gameObj ? imgMap[`${gameObj.slug}:${canonical.number}`] : undefined) ??
    canonical.imageUrl ??
    item.animalImageUrl ??
    null;

  return {
    ...item,
    animalNumber: canonical.number,
    animalName: canonical.name,
    animalLabel: canonical.label,
    animalImageUrl: resolvedUrl,
    gameLogoUrl: item.gameLogoUrl ?? gameObj?.logo_url ?? null,
  };
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(":");
  const hour = parseInt(h ?? "0", 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${m || "00"} ${ampm}`;
}

function getAnimalEmoji(num: number, name?: string): string {
  return getEmojiForNumber(num, name);
}

function formatBoardDate(d: Date): string {
  const weekday = d.toLocaleDateString("es-VE", { timeZone: LOTTERY_TIMEZONE, weekday: "long" });
  const day = d.toLocaleDateString("es-VE", { timeZone: LOTTERY_TIMEZONE, day: "numeric" });
  const month = d.toLocaleDateString("es-VE", { timeZone: LOTTERY_TIMEZONE, month: "long" });
  const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
  return `${capitalize(weekday)}, ${day} De ${capitalize(month)}`;
}

function buildFullSchedule(gameOrSlug: Game | string, _results: Result[]): string[] {
  return getGameScheduleTimes(gameOrSlug);
}

function findResultForTimeSlot(results: Result[], timeSlot: string): Result | undefined {
  const normSlot = timeSlot.replace(/^0/, "");
  return results.find((r) => {
    const rShort = r.draw_time.substring(0, 5).replace(/^0/, "");
    return rShort === normSlot;
  });
}

const DEFAULT_ROTATION_SECONDS = 25;

interface BoardWindowPage {
  id: string;
  type: "animalitos" | "triples";
  pageIndex: number;
  totalPages: number;
  title: string;
  label: string;
  shortLabel: string;
  animalCards?: GameWithResults[];
  tripleGames?: TripleGameConfig[];
}

export default function BoardPage({ onAdminClick }: BoardPageProps) {
  const { profile, signOut } = useAuth();
  const { settings } = useBoardSettings();
  const { isGameAllowed, cardsPerScreen } = useLicenseContext();
  const [games, setGames] = useState<Game[]>([]);
  const [resultsMap, setResultsMap] = useState<Record<string, Result[]>>({});
  const [animalImages, setAnimalImages] = useState<AnimalImageMap>({});
  const [animalNames, setAnimalNames] = useState<AnimalNameMap>({});
  const [animalLabels, setAnimalLabels] = useState<AnimalLabelMap>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [clock, setClock] = useState(new Date());
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [rotationProgress, setRotationProgress] = useState<number>(0);
  const [timerResetKey, setTimerResetKey] = useState<number>(() => Date.now());
  const [tripleResults, setTripleResults] = useState<TripleResult[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("pizarra_triple_results");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch {
        // ignore
      }
    }
    return [];
  });
  const [autoRotate, setAutoRotate] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("pizarra_auto_rotate_views");
      if (saved !== null) return saved === "true";
    }
    return true;
  });
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [alertQueue, setAlertQueue] = useState<ResultAlertItem[]>([]);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("lottery_voice_enabled");
      return saved !== null ? saved === "true" : true;
    }
    return true;
  });
  const isInitialLoadRef = useRef(true);
  const prevSignaturesRef = useRef<Map<string, string>>(new Map());
  const lastAlertAnnouncedIdRef = useRef<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("pizarra_last_announced_alert_id");
    }
    return null;
  });

  const { preferences } = useDisplay();
  const reloadOnNewResultRef = useRef(preferences?.reloadOnNewResult ?? false);
  const pendingReloadRef = useRef(false);
  const alertQueueRef = useRef(alertQueue);
  alertQueueRef.current = alertQueue;
  const animalImagesRef = useRef<AnimalImageMap>(animalImages);
  animalImagesRef.current = animalImages;
  const gamesRef = useRef<Game[]>(games);
  gamesRef.current = games;
  const resultsMapRef = useRef<Record<string, Result[]>>(resultsMap);
  resultsMapRef.current = resultsMap;

  useEffect(() => {
    reloadOnNewResultRef.current = preferences?.reloadOnNewResult ?? false;
  }, [preferences?.reloadOnNewResult]);

  const handleAlertModalClose = useCallback(() => {
    alertQueueRef.current = [];
    setAlertQueue([]);
    // If a reload was scheduled during the modal presentation, execute it now that the modal completed
    if (pendingReloadRef.current && typeof window !== "undefined") {
      pendingReloadRef.current = false;
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  }, []);

  const scheduleHardReload = useCallback(
    (resultId: string) => {
      if (!reloadOnNewResultRef.current || typeof window === "undefined") return;
      const key = "pizarra_last_reloaded_result_id";
      const prev = sessionStorage.getItem(key);
      if (prev !== resultId) {
        sessionStorage.setItem(key, resultId);
        // If modal is actively displaying, defer reload so modal completes full duration
        if (alertQueueRef.current.length > 0 && (preferences?.showAlertModal ?? true)) {
          pendingReloadRef.current = true;
        } else {
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        }
      }
    },
    [preferences?.showAlertModal],
  );

  const enqueueUniqueAlert = useCallback(
    (rawItem: ResultAlertItem): boolean => {
      if (rawItem.gameId && !isGameAllowed(rawItem.gameId)) {
        return false;
      }
      const item = resolveAlertWithAnimalImage(rawItem, animalImagesRef.current, gamesRef.current);
      if (sorteoAlertTracker.hasBeenAlerted(item)) {
        return false;
      }
      const key = getSorteoAlertKey(item);
      sorteoAlertTracker.markAsAlerted(key);
      if (!alertQueueRef.current.some((a) => getSorteoAlertKey(a) === key)) {
        alertQueueRef.current = [...alertQueueRef.current, item];
      }
      setAlertQueue((prev) => {
        if (prev.some((a) => getSorteoAlertKey(a) === key)) return prev;
        return [...prev, item];
      });
      return true;
    },
    [isGameAllowed],
  );

  const handleVoiceToggle = (enabled: boolean) => {
    setVoiceEnabled(enabled);
    if (typeof window !== "undefined") {
      localStorage.setItem("lottery_voice_enabled", String(enabled));
    }
  };

  const handleAutoRotateToggle = () => {
    setAutoRotate((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("pizarra_auto_rotate_views", String(next));
      }
      return next;
    });
    setTimerResetKey(Date.now());
  };

  const fetchAll = useCallback(async () => {
    // 1. Sync from server backend to get latest results, alerts, and custom animal videos/images
    let serverSyncedResults: Result[] = [];
    let serverSyncedTriples: TripleResult[] = [];
    try {
      const syncRes = await fetch("/api/public/results/sync");
      if (syncRes.ok) {
        const syncData = await syncRes.json();

        // Sync all latest results from server into client mockStore & storage
        if (Array.isArray(syncData?.results) && syncData.results.length > 0) {
          serverSyncedResults = syncData.results;
          const { mockStore, saveResultsToStorage } = await import("@/lib/mock-db");
          mockStore.results = syncData.results;
          if (typeof saveResultsToStorage === "function") {
            saveResultsToStorage();
          } else {
            try {
              localStorage.setItem("pizarra_mock_results", JSON.stringify(syncData.results));
            } catch {
              // ignore
            }
          }
        }

        // Sync triples results from server into client state & localStorage
        if (Array.isArray(syncData?.tripleResults)) {
          serverSyncedTriples = syncData.tripleResults;
          setTripleResults(syncData.tripleResults);
          try {
            localStorage.setItem("pizarra_triple_results", JSON.stringify(syncData.tripleResults));
          } catch {
            // ignore
          }
        }

        // Sync animal images into mockStore & localStorage so all TVs have them, preserving custom admin images
        if (Array.isArray(syncData?.animalImages) && syncData.animalImages.length > 0) {
          const { mockStore } = await import("@/lib/mock-db");
          const localCustom = recoverCustomAnimalImagesFromLocalStorage();
          const merged = mergeAnimalImagesPreserveCustom(
            mockStore.animal_images,
            syncData.animalImages,
            localCustom,
          );
          mockStore.animal_images = merged;
          try {
            localStorage.setItem("pizarra_custom_animal_images", JSON.stringify(merged));
            const customOnly = merged.filter((img) => !isDefaultCatalogImageUrl(img.image_url));
            if (customOnly.length > 0) {
              localStorage.setItem(
                "pizarra_user_custom_animal_images_v2",
                JSON.stringify(customOnly),
              );
            }
          } catch {
            // ignore
          }
        }

        // If server broadcasted a latestAlert, announce it only if this draw hasn't been alerted yet
        if (syncData?.latestAlert && syncData.latestAlert.id) {
          const alert = syncData.latestAlert as ResultAlertItem;
          const enqueued = enqueueUniqueAlert(alert);
          if (enqueued) {
            scheduleHardReload(alert.id);
          }
        }
      }
    } catch {
      // server route may be temporarily busy
    }

    const { data: gamesData } = await supabase
      .from("games")
      .select("*")
      .eq("is_active", true)
      .order("display_order");

    if (!gamesData) return;
    setGames(gamesData as Game[]);

    const today = lotteryDate();

    const [resultsPromises, imagesData, entriesData] = await Promise.all([
      Promise.all(
        (gamesData as Game[]).map(async (g) => {
          // If serverSyncedResults has fresh results for this game today, prioritize them immediately
          const matching = serverSyncedResults.filter(
            (r) => r.game_id === g.id && r.draw_date === today,
          );
          if (matching.length > 0) {
            matching.sort((a, b) => a.draw_time.localeCompare(b.draw_time));
            return { gameId: g.id, results: matching };
          }

          const { data } = await supabase
            .from("results")
            .select("*")
            .eq("game_id", g.id)
            .eq("draw_date", today)
            .order("draw_time", { ascending: true });
          return { gameId: g.id, results: (data ?? []) as Result[] };
        }),
      ),
      supabase.from("animal_images").select("*"),
      supabase.from("animal_entries").select("*"),
    ]);

    const map: Record<string, Result[]> = {};
    const imgMap: AnimalImageMap = {};
    const loadedGames = gamesData as Game[];
    const localRecoveredCustom = recoverCustomAnimalImagesFromLocalStorage();

    let localCachedImages: AnimalImage[] = [];
    if (typeof window !== "undefined") {
      try {
        const localRaw = localStorage.getItem("pizarra_custom_animal_images");
        if (localRaw) {
          const parsed = JSON.parse(localRaw);
          if (Array.isArray(parsed)) localCachedImages = parsed;
        }
      } catch {
        // ignore
      }
    }

    const combinedImages: AnimalImage[] = mergeAnimalImagesPreserveCustom(
      (imagesData.data ?? []) as AnimalImage[],
      localCachedImages,
      localRecoveredCustom,
    );

    for (const img of combinedImages) {
      if (!img?.image_url) continue;
      imgMap[`${img.game_id}:${img.animal_number}`] = img.image_url;
      const matchedGame = loadedGames.find((g) => g.id === img.game_id || g.slug === img.game_id);
      if (matchedGame) {
        imgMap[`${matchedGame.id}:${img.animal_number}`] = img.image_url;
        imgMap[`${matchedGame.slug}:${img.animal_number}`] = img.image_url;
      }
    }
    animalImagesRef.current = imgMap;
    setAnimalImages(imgMap);

    const nameMap: AnimalNameMap = {};
    const labelMap: AnimalLabelMap = {};
    for (const entry of (entriesData.data ?? []) as AnimalEntry[]) {
      nameMap[`${entry.game_id}:${entry.number}`] = entry.name;
      if (entry.label) labelMap[`${entry.game_id}:${entry.number}`] = entry.label;
      const matchedGame = loadedGames.find(
        (g) => g.id === entry.game_id || g.slug === entry.game_id,
      );
      if (matchedGame) {
        nameMap[`${matchedGame.id}:${entry.number}`] = entry.name;
        nameMap[`${matchedGame.slug}:${entry.number}`] = entry.name;
        if (entry.label) {
          labelMap[`${matchedGame.id}:${entry.number}`] = entry.label;
          labelMap[`${matchedGame.slug}:${entry.number}`] = entry.label;
        }
      }
    }
    setAnimalNames(nameMap);
    setAnimalLabels(labelMap);

    const newAlerts: ResultAlertItem[] = [];
    const prevResultsByGame = resultsMapRef.current;

    for (const r of resultsPromises) {
      const gameObj = (gamesData as Game[]).find((g) => g.id === r.gameId);
      if (!gameObj) {
        map[r.gameId] = r.results;
        continue;
      }

      const prevGameResults = prevResultsByGame[r.gameId] ?? [];
      const frozenGameResults: Result[] = [];

      for (const rawRes of r.results) {
        const slotKey = rawRes.draw_time.substring(0, 5).replace(/^0/, "");
        const existingInSlot = prevGameResults.find(
          (pr) =>
            pr.draw_date === rawRes.draw_date &&
            pr.draw_time.substring(0, 5).replace(/^0/, "") === slotKey,
        );

        const canonical = resolveCanonicalAnimal(
          gameObj.slug || gameObj.id,
          rawRes.animal_number,
          rawRes.animal_name,
          imgMap,
          nameMap,
          labelMap,
        );

        let effectiveRes: Result;
        if (
          existingInSlot &&
          (rawRes.source !== "manual" || existingInSlot.animal_number === canonical.number)
        ) {
          // Freeze already-loaded draw slot during polling unless manually edited with a new number
          effectiveRes = existingInSlot;
        } else {
          effectiveRes = {
            ...rawRes,
            animal_number: canonical.number,
            animal_name: canonical.name,
          };
        }

        frozenGameResults.push(effectiveRes);

        const sig = `${effectiveRes.animal_number}:${effectiveRes.animal_name}:${effectiveRes.draw_time}`;
        const prevSig = prevSignaturesRef.current.get(effectiveRes.id);

        if (!isInitialLoadRef.current) {
          if (prevSig === undefined || prevSig !== sig) {
            const candidate = {
              gameId: gameObj.id,
              drawDate: effectiveRes.draw_date,
              drawTime: effectiveRes.draw_time,
            };

            if (!sorteoAlertTracker.hasBeenAlerted(candidate)) {
              const resolvedForAlert = resolveCanonicalAnimal(
                gameObj.slug || gameObj.id,
                effectiveRes.animal_number,
                effectiveRes.animal_name,
                imgMap,
                nameMap,
                labelMap,
              );

              newAlerts.push({
                id: `draw-${effectiveRes.id}-${effectiveRes.draw_date}-${effectiveRes.draw_time}`,
                gameId: gameObj.id,
                gameName: gameObj.name,
                gameColor: gameObj.color,
                gameLogoUrl: gameObj.logo_url,
                drawDate: effectiveRes.draw_date,
                drawTime: effectiveRes.draw_time,
                animalNumber: resolvedForAlert.number,
                animalName: resolvedForAlert.name,
                animalLabel: resolvedForAlert.label,
                animalImageUrl: resolvedForAlert.imageUrl,
                animalEmoji: getAnimalEmoji(resolvedForAlert.number, resolvedForAlert.name),
              });
            }
          }
        }
        prevSignaturesRef.current.set(effectiveRes.id, sig);
      }

      map[r.gameId] = frozenGameResults;
    }
    resultsMapRef.current = map;
    setResultsMap(map);

    // Check newly synced Triples results for real-time alert and voice announcements
    const todaysTriples = serverSyncedTriples.filter((tr) => tr.draw_date === today);
    for (const tr of todaysTriples) {
      const tripleKey = `triple:${tr.game_id}:${tr.draw_date}:${tr.draw_time}`;
      const sig = `${tr.triple_a}|${tr.triple_b ?? ""}|${tr.triple_c ?? ""}|${tr.zodiac_sign ?? ""}`;
      const prevSig = prevSignaturesRef.current.get(tripleKey);

      if (!isInitialLoadRef.current) {
        if (prevSig === undefined || prevSig !== sig) {
          const tripleGame = TRIPLE_GAMES.find((g) => g.id === tr.game_id);
          if (tripleGame) {
            const candidate = {
              gameId: tripleGame.id,
              drawDate: tr.draw_date,
              drawTime: tr.draw_time,
            };
            if (!sorteoAlertTracker.hasBeenAlerted(candidate)) {
              newAlerts.push(buildTripleAlertItem(tr, tripleGame));
            }
          }
        }
      }
      prevSignaturesRef.current.set(tripleKey, sig);
    }

    if (isInitialLoadRef.current) {
      // Mark all pre-existing draws loaded on startup as already alerted
      const existingItems: { gameId: string; drawDate: string; drawTime: string }[] = [];
      for (const r of resultsPromises) {
        for (const res of r.results) {
          existingItems.push({
            gameId: res.game_id,
            drawDate: res.draw_date,
            drawTime: res.draw_time,
          });
        }
      }
      for (const tr of todaysTriples) {
        existingItems.push({
          gameId: tr.game_id,
          drawDate: tr.draw_date,
          drawTime: tr.draw_time,
        });
      }
      sorteoAlertTracker.markMultipleAsAlerted(existingItems);
      isInitialLoadRef.current = false;
    } else if (newAlerts.length > 0) {
      let anyEnqueued = false;
      for (const alert of newAlerts) {
        if (enqueueUniqueAlert(alert)) {
          anyEnqueued = true;
        }
      }
      const lastNew = newAlerts[newAlerts.length - 1];
      if (anyEnqueued && lastNew) scheduleHardReload(lastNew.id);
    }

    setLastUpdate(new Date());
    setLoading(false);
  }, [enqueueUniqueAlert, scheduleHardReload]);

  // Listen for real-time broadcasts and check pending alerts on mount
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("pizarra_lottery_channel");
      bc.onmessage = (event) => {
        if (event.data?.type === "NEW_RESULT_ALERT" && event.data.alert) {
          const incoming = event.data.alert as ResultAlertItem;
          const enqueued = enqueueUniqueAlert(incoming);
          if (enqueued) {
            scheduleHardReload(incoming.id);
          }
          fetchAll();
        } else if (event.data?.type === "ANIMAL_MEDIA_UPDATED") {
          fetchAll();
        }
      };
    } catch {
      // ignore
    }

    const checkPendingAlerts = () => {
      try {
        const raw = localStorage.getItem("pizarra_pending_result_alerts");
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list) && list.length > 0) {
            for (const item of list as ResultAlertItem[]) {
              enqueueUniqueAlert(item);
            }
            localStorage.removeItem("pizarra_pending_result_alerts");
          }
        }
      } catch {
        // ignore
      }
    };

    checkPendingAlerts();

    const onStorage = (e: StorageEvent) => {
      if (e.key === "pizarra_pending_result_alerts") {
        checkPendingAlerts();
      } else if (
        e.key === "pizarra_custom_animal_images" ||
        e.key === "pizarra_user_custom_animal_images_v2"
      ) {
        fetchAll();
      }
    };
    window.addEventListener("storage", onStorage);

    // Subscribe to Supabase Realtime changes on animal_images & animal_entries
    const realtimeChannel = supabase
      .channel("board-animal-media-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "animal_images" }, () => {
        fetchAll();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "animal_entries" }, () => {
        fetchAll();
      })
      .subscribe();

    return () => {
      bc?.close();
      window.removeEventListener("storage", onStorage);
      supabase.removeChannel(realtimeChannel);
    };
  }, [enqueueUniqueAlert, fetchAll, scheduleHardReload]);

  const handleManualRefresh = useCallback(async () => {
    try {
      const res = await fetch("/api/public/results/sync", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.results)) {
          const { mockStore } = await import("@/lib/mock-db");
          mockStore.results = data.results;
        }
        if (Array.isArray(data?.tripleResults)) {
          setTripleResults(data.tripleResults);
          try {
            localStorage.setItem("pizarra_triple_results", JSON.stringify(data.tripleResults));
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }
    await fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleTestAlert = () => {
    const allResults: { res: Result; game: Game }[] = [];
    for (const g of games) {
      const gResults = resultsMap[g.id] ?? [];
      for (const r of gResults) {
        allResults.push({ res: r, game: g });
      }
    }

    const sample = allResults.length > 0 ? allResults[allResults.length - 1] : null;
    if (sample) {
      const g = sample.game;
      const r = sample.res;
      const displayName = animalNames[`${g.id}:${r.animal_number}`] ?? r.animal_name;
      const displayLabel =
        animalLabels[`${g.id}:${r.animal_number}`] ?? String(r.animal_number).padStart(2, "0");
      const imgUrl =
        animalImages[`${g.id}:${r.animal_number}`] ?? animalImages[`any:${r.animal_number}`];
      setAlertQueue([
        {
          id: `test-${Date.now()}`,
          gameId: g.id,
          gameName: g.name,
          gameColor: g.color,
          gameLogoUrl: g.logo_url,
          drawDate: r.draw_date,
          drawTime: r.draw_time,
          animalNumber: r.animal_number,
          animalName: displayName,
          animalLabel: displayLabel,
          animalImageUrl: imgUrl,
          animalEmoji: getAnimalEmoji(r.animal_number, displayName),
        },
      ]);
    } else if (games.length > 0) {
      const g = games[0]!;
      const imgUrl = animalImages[`${g.id}:4`] ?? animalImages["any:4"] ?? null;
      setAlertQueue([
        {
          id: `test-${Date.now()}`,
          gameId: g.id,
          gameName: g.name,
          gameColor: g.color,
          gameLogoUrl: g.logo_url,
          drawDate: lotteryDate(),
          drawTime: "10:00:00",
          animalNumber: 4,
          animalName: "Alacrán",
          animalLabel: "04",
          animalImageUrl: imgUrl,
          animalEmoji: getAnimalEmoji(4, "Alacrán"),
        },
      ]);
    }
  };

  const handleExitToEntryPanel = async () => {
    try {
      localStorage.removeItem("pizarra_activated_pin");
    } catch {
      // ignore
    }
    if (profile) {
      try {
        await signOut();
      } catch {
        // ignore
      }
    }
    window.dispatchEvent(new CustomEvent("pizarra:open-license-screen"));
  };

  // Paginación dinámica según Productos por Pantalla configurados en la licencia (8 por defecto)
  const boardWindows = useMemo<BoardWindowPage[]>(() => {
    const list: BoardWindowPage[] = [];
    const maxPerPage =
      cardsPerScreen === "TODAS"
        ? Math.max(100, games.length + TRIPLE_GAMES.length)
        : Math.max(2, Number(cardsPerScreen) || DEFAULT_CARDS_PER_SCREEN);

    // 1. Animalitos (loterías visibles divididas según el límite configurado)
    const visibleAnimals = games.filter((g) => isGameAllowed(g.slug || g.id));
    const allAnimalCards: GameWithResults[] = visibleAnimals.map((g) => ({
      ...g,
      latest_results: resultsMap[g.id] ?? [],
    }));

    if (allAnimalCards.length > 0) {
      const totalAnimalPages = Math.ceil(allAnimalCards.length / maxPerPage);
      for (let i = 0; i < totalAnimalPages; i++) {
        const chunk = allAnimalCards.slice(i * maxPerPage, (i + 1) * maxPerPage);
        const isMulti = totalAnimalPages > 1;
        list.push({
          id: `animalitos-${i + 1}`,
          type: "animalitos",
          pageIndex: i,
          totalPages: totalAnimalPages,
          title: isMulti
            ? `Pizarra Animaltec · Animalitos (Parte ${i + 1} de ${totalAnimalPages})`
            : "Pizarra Animaltec · Animalitos",
          label: isMulti ? `Animalitos ${i + 1}/${totalAnimalPages}` : "Animalitos",
          shortLabel: isMulti ? `${i + 1}/${totalAnimalPages}` : "Anim",
          animalCards: chunk,
        });
      }
    }

    // 2. Triples (loterías visibles divididas según el límite configurado)
    const visibleTriples = TRIPLE_GAMES.filter((g) => isGameAllowed(g.id) || isGameAllowed(g.slug));
    if (visibleTriples.length > 0) {
      const totalTriplePages = Math.ceil(visibleTriples.length / maxPerPage);
      for (let i = 0; i < totalTriplePages; i++) {
        const chunk = visibleTriples.slice(i * maxPerPage, (i + 1) * maxPerPage);
        const isMulti = totalTriplePages > 1;
        list.push({
          id: `triples-${i + 1}`,
          type: "triples",
          pageIndex: i,
          totalPages: totalTriplePages,
          title: isMulti
            ? `Pizarra Animaltec · Triples (Parte ${i + 1} de ${totalTriplePages})`
            : "Pizarra Animaltec · Resultados de Triples",
          label: isMulti ? `Triples ${i + 1}/${totalTriplePages}` : "Triples",
          shortLabel: isMulti ? `${i + 1}/${totalTriplePages}` : "Trip",
          tripleGames: chunk,
        });
      }
    }

    if (list.length === 0) {
      list.push({
        id: "empty-1",
        type: "animalitos",
        pageIndex: 0,
        totalPages: 1,
        title: "Pizarra Animaltec",
        label: "Pizarra",
        shortLabel: "1",
        animalCards: [],
      });
    }

    return list;
  }, [games, resultsMap, isGameAllowed, cardsPerScreen]);

  const safePageIndex = activePageIndex < boardWindows.length ? activePageIndex : 0;
  const currentWindow = boardWindows[safePageIndex] || boardWindows[0];

  const goToPage = useCallback(
    (index: number) => {
      setActivePageIndex((index + boardWindows.length) % boardWindows.length);
      setTimerResetKey(Date.now());
      setRotationProgress(0);
    },
    [boardWindows.length],
  );

  const goToNextPage = useCallback(() => {
    goToPage(safePageIndex + 1);
  }, [goToPage, safePageIndex]);

  const goToPrevPage = useCallback(() => {
    goToPage(safePageIndex - 1);
  }, [goToPage, safePageIndex]);

  // Soporte para control remoto TV y teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (
        e.key === "ArrowRight" ||
        e.key === "ArrowDown" ||
        e.key === "PageDown" ||
        e.key === " "
      ) {
        e.preventDefault();
        goToNextPage();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        goToPrevPage();
      } else if (e.key >= "1" && e.key <= "9") {
        const targetIdx = parseInt(e.key, 10) - 1;
        if (targetIdx < boardWindows.length) {
          goToPage(targetIdx);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToNextPage, goToPrevPage, goToPage, boardWindows.length]);

  // Rotación automática cada 25 segundos (con pausa durante anuncios emergentes y configuración)
  const isRotationActive = autoRotate || settings.rotation_enabled;
  useEffect(() => {
    if (!isRotationActive) return;
    if (alertQueue.length > 0) return; // Pausa mientras el popup de sorteo está activo
    if (showVoiceSettings) return; // Pausa mientras el menú de voz está abierto
    if (boardWindows.length <= 1) return;

    const intervalSec = Math.max(5, settings.rotation_interval_seconds || DEFAULT_ROTATION_SECONDS);
    const intervalMs = intervalSec * 1000;
    const tickInterval = 500;
    let elapsed = 0;

    const timer = setInterval(() => {
      elapsed += tickInterval;
      setRotationProgress(Math.min(100, (elapsed / intervalMs) * 100));

      if (elapsed >= intervalMs) {
        elapsed = 0;
        setRotationProgress(0);
        setActivePageIndex((prev) => (prev + 1) % boardWindows.length);
      }
    }, tickInterval);

    return () => clearInterval(timer);
  }, [
    isRotationActive,
    alertQueue.length,
    showVoiceSettings,
    boardWindows.length,
    settings.rotation_interval_seconds,
    timerResetKey,
  ]);

  const enrichedAlertQueue = useMemo(
    () =>
      alertQueue
        .filter((item) => !item.gameId || isGameAllowed(item.gameId))
        .map((item) => resolveAlertWithAnimalImage(item, animalImages, games)),
    [alertQueue, animalImages, games, isGameAllowed],
  );

  return (
    <div
      className="full-screen-board h-screen w-screen overflow-hidden flex flex-col font-sans"
      style={{
        backgroundColor: settings.background_color || "#000000",
        color: settings.text_color || "#ffffff",
        fontFamily: settings.font_family || "inherit",
      }}
    >
      {/* Header */}
      <header
        className="board-fluid-header shrink-0 flex items-center justify-between"
        style={{
          backgroundColor: settings.surface_color || "transparent",
        }}
      >
        {/* Left Title & Window Tabs */}
        <div className="flex items-center gap-3 lg:gap-4 flex-wrap">
          <h1
            className="text-lg sm:text-xl lg:text-2xl font-black tracking-tight font-sans truncate max-w-[280px] sm:max-w-none"
            style={{ color: settings.text_color || "#ffffff" }}
          >
            {currentWindow.title}
          </h1>

          {/* Indicadores Visuales y Pestañas de Ventanas (Máx. 8 productos por ventana) */}
          {boardWindows.length > 1 && (
            <div className="flex items-center gap-1 p-1 bg-slate-900/90 border border-slate-800 rounded-xl overflow-x-auto select-none shadow-inner">
              <button
                type="button"
                onClick={goToPrevPage}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                title="Ventana anterior (o tecla Flecha Izquierda)"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              {boardWindows.map((win, idx) => {
                const isActive = idx === safePageIndex;
                const isAnimal = win.type === "animalitos";

                return (
                  <button
                    key={win.id}
                    type="button"
                    onClick={() => goToPage(idx)}
                    className={`relative px-2.5 py-1 rounded-lg border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap overflow-hidden ${
                      isActive
                        ? isAnimal
                          ? "bg-emerald-950/90 border-emerald-500/80 text-emerald-300 shadow-md ring-1 ring-emerald-500/40"
                          : "bg-amber-950/90 border-amber-500/80 text-amber-300 shadow-md ring-1 ring-amber-500/40"
                        : "bg-slate-950/50 border-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-800/80"
                    }`}
                    title={`Ver ${win.title} (Rotación cada 25s)`}
                  >
                    {isAnimal ? (
                      <PawPrint
                        className={`w-3.5 h-3.5 ${isActive ? "text-emerald-400" : "text-slate-500"}`}
                      />
                    ) : (
                      <Hash
                        className={`w-3.5 h-3.5 ${isActive ? "text-amber-400" : "text-slate-500"}`}
                      />
                    )}
                    <span>{win.label}</span>

                    {/* Barra de progreso discreta de 25 segundos para la ventana activa */}
                    {isActive &&
                      isRotationActive &&
                      boardWindows.length > 1 &&
                      alertQueue.length === 0 &&
                      !showVoiceSettings && (
                        <span
                          className={`absolute bottom-0 left-0 h-0.5 transition-all duration-300 ${
                            isAnimal ? "bg-emerald-400" : "bg-amber-400"
                          }`}
                          style={{ width: `${rotationProgress}%` }}
                        />
                      )}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={goToNextPage}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                title="Siguiente ventana (o tecla Flecha Derecha)"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Right Clock & Controls */}
        <div className="flex items-center gap-3 sm:gap-5">
          <div className="text-right">
            <div className="text-lg sm:text-2xl lg:text-3xl font-mono font-black text-emerald-400 tracking-tight tabular-nums leading-none">
              {clock.toLocaleTimeString("es-VE", {
                timeZone: LOTTERY_TIMEZONE,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
              })}
            </div>
            <div className="text-[10px] sm:text-xs font-semibold opacity-90 mt-0.5">
              {formatBoardDate(clock)}
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={handleTestAlert}
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 transition text-xs text-slate-300 hidden md:flex items-center gap-1.5 cursor-pointer"
              title="Probar voz"
            >
              <Volume2 className="w-4 h-4 text-emerald-400" />
              <span>Probar voz</span>
            </button>
            <button
              onClick={() => setShowVoiceSettings(true)}
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 transition text-xs text-slate-300 hidden lg:flex items-center gap-1.5 cursor-pointer"
              title="Ajustar voz"
            >
              <Sliders className="w-4 h-4 text-amber-400" />
              <span>Voz</span>
            </button>
            <button
              onClick={() => handleVoiceToggle(!voiceEnabled)}
              className={`p-2 rounded-lg transition border border-slate-800 cursor-pointer ${
                voiceEnabled
                  ? "bg-blue-950/60 text-blue-400 hover:bg-blue-900/60"
                  : "bg-slate-900 text-slate-500 hover:bg-slate-800"
              }`}
              title={voiceEnabled ? "Voz activada" : "Voz silenciada"}
            >
              {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Alternar rotación automática de 25 segundos */}
            <button
              onClick={handleAutoRotateToggle}
              className={`px-2.5 py-2 rounded-lg border transition flex items-center gap-1.5 text-xs font-bold cursor-pointer whitespace-nowrap shrink-0 ${
                isRotationActive
                  ? "bg-emerald-950/80 border-emerald-600/80 text-emerald-300 hover:bg-emerald-900/80"
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800"
              }`}
              title={
                isRotationActive
                  ? "Rotación automática activa (cada 25s) · Haz clic para pausar"
                  : "Rotación pausada · Haz clic para activar rotación automática (cada 25s)"
              }
            >
              <Repeat className="w-4 h-4" />
              <span className="hidden sm:inline">{isRotationActive ? "Auto 25s" : "Manual"}</span>
            </button>

            <button
              onClick={handleManualRefresh}
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 transition text-slate-300"
              title="Actualizar"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("pizarra:open-license-screen"))}
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 transition text-amber-400 flex items-center gap-1.5 text-xs font-semibold"
              title="Cambiar o registrar PIN de Licencia"
            >
              <KeyRound className="w-4 h-4" />
              <span className="hidden sm:inline">Licencia</span>
            </button>
            <button
              onClick={onAdminClick}
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 transition text-slate-300"
              title="Panel de administración"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={handleExitToEntryPanel}
              className="px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg bg-red-950/70 border border-red-700/80 hover:bg-red-900/80 text-red-200 transition flex items-center gap-1.5 text-xs font-bold shadow-md cursor-pointer"
              title="Salir de la pizarra y volver al panel de entrada"
            >
              <LogOut className="w-4 h-4 text-red-400" />
              <span>Salir</span>
            </button>
          </div>
        </div>
      </header>

      {/* Top / Fullwidth Ad Banner (Fixed 15vh shrink-0 when active) */}
      <AdBanner placement={["top", "fullwidth"]} />

      {/* Main Board & Optional Sidebar Ad Container (Fixed 75% / 25% when sidebar active) */}
      <div className="flex-1 min-h-0 min-w-0 w-full flex flex-row overflow-hidden">
        <main
          className="board-fluid-main w-3/4 flex-1 min-h-0 min-w-0 h-full overflow-hidden"
          style={{ backgroundColor: settings.background_color || "#000000" }}
        >
          {currentWindow.type === "triples" ? (
            <TriplesBoard
              results={tripleResults.filter((r) => r.draw_date === lotteryDate())}
              loading={loading}
              games={currentWindow.tripleGames}
            />
          ) : loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-pulse text-slate-400 font-medium">Cargando resultados...</div>
            </div>
          ) : !currentWindow.animalCards || currentWindow.animalCards.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-400">
              No hay juegos activos configurados para esta ventana.
            </div>
          ) : (
            <div
              className="board-fluid-grid grid h-full w-full min-h-0 min-w-0 auto-rows-fr overflow-hidden"
              style={getResponsiveBoardGridStyle(currentWindow.animalCards.length)}
            >
              {currentWindow.animalCards.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  animalImages={animalImages}
                  animalNames={animalNames}
                  animalLabels={animalLabels}
                  settings={settings}
                  cardCount={currentWindow.animalCards?.length ?? 8}
                />
              ))}
            </div>
          )}
        </main>

        <AdBanner placement="sidebar" />
      </div>

      {/* Bottom Ad Banner & Live Promotional Ticker */}
      <AdBanner placement="bottom" />
      <AdTickerBar />

      {/* Footer */}
      <footer className="px-6 py-0.5 bg-black border-t border-slate-900/80 text-center shrink-0">
        <p className="text-[10px] text-slate-600 font-mono">
          pizarraianimaltec · Pizarra de Resultados de Lotería en Vivo
        </p>
      </footer>

      {/* Real-time result announcement modal */}
      {enrichedAlertQueue.length > 0 && (preferences.showAlertModal ?? true) && (
        <ResultAlertModal
          alerts={enrichedAlertQueue}
          autoCloseSeconds={preferences.alertDurationSeconds ?? 20}
          voiceEnabled={voiceEnabled}
          onToggleVoice={handleVoiceToggle}
          onClose={handleAlertModalClose}
        />
      )}

      {/* Voice configuration modal */}
      <VoiceSettingsModal isOpen={showVoiceSettings} onClose={() => setShowVoiceSettings(false)} />
    </div>
  );
}

function AnimalAvatar({
  imageUrl,
  name,
  number,
  className,
}: {
  imageUrl?: string;
  name: string;
  number: number;
  className?: string;
}) {
  return (
    <AnimalMedia
      mediaUrl={imageUrl}
      name={name}
      number={number}
      className={className || "w-full h-full object-contain rounded-md"}
      emojiClassName="text-[clamp(1.8rem,3.2vw,3.8rem)] leading-none select-none"
    />
  );
}

function GameCard({
  game,
  animalImages,
  animalNames,
  animalLabels,
  settings,
  cardCount = 8,
}: {
  game: GameWithResults;
  animalImages: AnimalImageMap;
  animalNames: AnimalNameMap;
  animalLabels: AnimalLabelMap;
  settings: ReturnType<typeof useBoardSettings>["settings"];
  cardCount?: number;
}) {
  const scheduleTimes = buildFullSchedule(game, game.latest_results || []);
  const validSlots = new Set(scheduleTimes.map((t) => t.substring(0, 5).replace(/^0/, "")));
  const validResults = (game.latest_results || [])
    .filter((r) => {
      const slot = r.draw_time.substring(0, 5).replace(/^0/, "");
      return validSlots.has(slot);
    })
    .sort((a, b) => a.draw_time.localeCompare(b.draw_time));
  const latestResult = validResults.length > 0 ? validResults[validResults.length - 1] : null;

  const latestCanonical = latestResult
    ? resolveCanonicalAnimal(
        game.slug || game.id,
        latestResult.animal_number,
        latestResult.animal_name,
        animalImages,
        animalNames,
        animalLabels,
      )
    : null;

  const latestImgUrl = latestCanonical?.imageUrl;
  const latestDisplayName = latestCanonical?.name ?? "";
  const latestLabel = latestCanonical?.label ?? "";
  const isExpandedCard = cardCount <= 4;

  return (
    <div
      className="fluid-game-card h-full w-full min-h-0 min-w-0 overflow-hidden flex flex-col justify-between"
      style={{
        backgroundColor: settings.card_color || "#000000",
        borderColor: game.color,
        boxShadow: `0 0 15px ${game.color}15`,
      }}
    >
      {/* Top Header */}
      <div className="fluid-card-header shrink-0">
        {game.logo_url ? (
          <div
            className="rounded-full border border-slate-800 bg-slate-900 flex items-center justify-center overflow-hidden shrink-0 fluid-logo-wrapper"
            style={{ width: "var(--display-logo)", height: "var(--display-logo)" }}
          >
            <img
              src={game.logo_url}
              alt={game.name}
              className="w-full h-full object-contain max-h-full max-w-full p-0.5"
            />
          </div>
        ) : (
          <div
            className="rounded-full flex items-center justify-center text-xs font-bold shrink-0 fluid-logo-wrapper"
            style={{
              backgroundColor: `${game.color}20`,
              color: game.color,
              width: "var(--display-logo)",
              height: "var(--display-logo)",
            }}
          >
            🎯
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="fluid-game-title truncate" style={{ color: game.color }}>
            {game.name}
          </h2>
          <p className="fluid-game-subtitle font-mono truncate">
            {validResults.length >= scheduleTimes.length
              ? "Sorteos de hoy completos"
              : "En progreso"}
          </p>
        </div>
      </div>

      {/* Hero Center Display (Customized by result_row_color, --display-hero-scale, --display-animal-scale and --card-avatar-scale) */}
      <div
        className="fluid-hero-banner shrink-0 min-h-0 overflow-hidden"
        style={{
          backgroundColor: settings.result_row_color || "rgba(15, 23, 42, 0.8)",
        }}
      >
        <div
          className="fluid-hero-avatar rounded-xl bg-slate-950/90 border border-slate-700/80 flex items-center justify-center shrink-0 overflow-hidden shadow-inner p-1"
          style={{
            width:
              "calc(clamp(2.2rem, min(5.5vh, 4vw), 4.8rem) * var(--display-animal-scale, 1) * var(--card-avatar-scale, 1))",
            height:
              "calc(clamp(2.2rem, min(5.5vh, 4vw), 4.8rem) * var(--display-animal-scale, 1) * var(--card-avatar-scale, 1))",
          }}
        >
          {latestResult && latestCanonical ? (
            <AnimalAvatar
              imageUrl={latestImgUrl}
              name={latestDisplayName}
              number={latestCanonical.number}
              className="w-full h-full object-contain max-h-full max-w-full p-0.5 drop-shadow-md rounded-lg"
            />
          ) : (
            <Target className="w-6 h-6 sm:w-8 sm:h-8 text-slate-500" />
          )}
        </div>

        <div className="flex-1 text-right min-w-0 overflow-hidden">
          <div
            className="h-1.5 w-10 sm:w-14 rounded-full ml-auto mb-1 shadow-sm"
            style={{ backgroundColor: game.color }}
          />
          {latestResult ? (
            <div className="truncate">
              <div className="fluid-hero-text font-black text-white tracking-wide truncate">
                {latestLabel} - {latestDisplayName.toUpperCase()}
              </div>
              <div className="fluid-hero-time font-mono font-semibold text-slate-300 mt-0.5 truncate">
                {formatTime(latestResult.draw_time)}
              </div>
            </div>
          ) : (
            <div className="fluid-hero-text font-bold text-slate-400 tracking-wide truncate">
              Esperando sorteo
            </div>
          )}
        </div>
      </div>

      {/* Bottom Schedule Matrix Grid */}
      <div className="fluid-schedule-matrix grid flex-1 h-full w-full min-h-0 min-w-0 grid-cols-4 auto-rows-fr overflow-hidden">
        {scheduleTimes.map((timeSlot) => {
          const res = findResultForTimeSlot(validResults, timeSlot);
          const cellCanonical = res
            ? resolveCanonicalAnimal(
                game.slug || game.id,
                res.animal_number,
                res.animal_name,
                animalImages,
                animalNames,
                animalLabels,
              )
            : null;
          const displayNum = cellCanonical ? cellCanonical.label : null;

          return (
            <div
              key={timeSlot}
              className={`fluid-schedule-cell h-full w-full min-h-0 min-w-0 overflow-hidden transition ${
                res ? "border-slate-700/90 shadow-sm" : "border-slate-800/80 opacity-80"
              }`}
              style={{
                backgroundColor: res
                  ? settings.result_row_color || "rgba(15, 23, 42, 0.9)"
                  : "rgba(2, 6, 23, 0.6)",
              }}
            >
              <div className="fluid-cell-time truncate w-full">{formatTime(timeSlot)}</div>
              {res && cellCanonical ? (
                isExpandedCard ? (
                  <div className="flex items-center justify-center gap-1.5 w-full min-w-0 px-1 mt-0.5">
                    {cellCanonical.imageUrl && (
                      <div
                        className="shrink-0 overflow-hidden rounded"
                        style={{
                          width:
                            "calc(clamp(1.1rem, min(2.4vh, 1.8vw), 2.2rem) * var(--display-animal-scale, 1) * var(--card-cell-scale, 1))",
                          height:
                            "calc(clamp(1.1rem, min(2.4vh, 1.8vw), 2.2rem) * var(--display-animal-scale, 1) * var(--card-cell-scale, 1))",
                        }}
                      >
                        <AnimalAvatar
                          imageUrl={cellCanonical.imageUrl}
                          name={cellCanonical.name}
                          number={cellCanonical.number}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}
                    <div className="flex flex-col items-center justify-center min-w-0 leading-none">
                      <span
                        style={{ color: game.color }}
                        className="fluid-cell-result font-black leading-none"
                      >
                        {displayNum}
                      </span>
                      <span
                        className="text-slate-300 font-bold uppercase truncate max-w-full mt-0.5"
                        style={{
                          fontSize:
                            "calc(clamp(0.42rem, min(0.95vh, 0.65vw), 0.7rem) * var(--display-font-scale, 1) * var(--card-cell-scale, 1))",
                        }}
                      >
                        {cellCanonical.name}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="fluid-cell-result truncate w-full">
                    <span style={{ color: game.color }} className="font-black">
                      {displayNum}
                    </span>
                  </div>
                )
              ) : (
                <div className="fluid-cell-result truncate w-full">
                  <span className="text-slate-600 font-normal">—</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
