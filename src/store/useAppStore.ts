import { create } from "zustand";
import { persist } from "zustand/middleware";

export const TTS_MODELS = ["tts-1", "tts-1-hd"] as const;
export type TtsModel = (typeof TTS_MODELS)[number];

export const TTS_VOICES = [
	"alloy",
	"ash",
	"coral",
	"echo",
	"fable",
	"onyx",
	"nova",
	"sage",
	"shimmer",
] as const;
export type TtsVoice = (typeof TTS_VOICES)[number];

export const OUTPUT_FORMATS = ["mp3", "aac", "opus", "flac", "wav"] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export const CHUNKING_MODES = ["valeon", "custom"] as const;
export type ChunkingMode = (typeof CHUNKING_MODES)[number];

export type ChunkingConfig = {
	mode: ChunkingMode;
	targetChars: number;
	hardLimit: number;
	splitOnParagraphs: boolean;
	splitOnLines: boolean;
	splitOnSentences: boolean;
	headingDelimiter: string;
};

export type UserConfig = {
	apiKey: string;
	model: TtsModel;
	voice: TtsVoice;
	outputFormat: OutputFormat;
	chunking: ChunkingConfig;
};

export const VALEON_CHUNKING_PRESET: Omit<ChunkingConfig, "mode"> = {
	targetChars: 4096,
	hardLimit: 4096,
	splitOnParagraphs: true,
	splitOnLines: false,
	splitOnSentences: true,
	headingDelimiter: "#",
};

export const defaultConfig: UserConfig = {
	apiKey: "",
	model: "tts-1",
	voice: "alloy",
	outputFormat: "mp3",
	chunking: {
		mode: "valeon",
		...VALEON_CHUNKING_PRESET,
	},
};

type AppState = {
	config: UserConfig;
	setApiKey: (apiKey: string) => void;
	setModel: (model: TtsModel) => void;
	setVoice: (voice: TtsVoice) => void;
	setOutputFormat: (format: OutputFormat) => void;
	setChunkingMode: (mode: ChunkingMode) => void;
	updateChunking: (partial: Partial<ChunkingConfig>) => void;
	resetConfig: () => void;
	hydrateConfig: (config: UserConfig) => void;
};

const clampNumber = (
	value: unknown,
	fallback: number,
	min: number,
	max: number,
) => {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return fallback;
	}
	return Math.min(Math.max(value, min), max);
};

const coerceString = (value: unknown, fallback: string) =>
	typeof value === "string" ? value : fallback;

const coerceBoolean = (value: unknown, fallback: boolean) =>
	typeof value === "boolean" ? value : fallback;

const isEnumValue = <T extends readonly string[]>(
	value: unknown,
	options: T,
): value is T[number] =>
	typeof value === "string" && options.includes(value as T[number]);

const coerceEnum = <T extends readonly string[]>(
	value: unknown,
	options: T,
	fallback: T[number],
): T[number] => (isEnumValue(value, options) ? value : fallback);

const coerceChunking = (value: unknown): ChunkingConfig => {
	const record = typeof value === "object" && value !== null ? value : {};
	const targetChars = clampNumber(
		(record as { targetChars?: unknown }).targetChars,
		defaultConfig.chunking.targetChars,
		200,
		4096,
	);
	const hardLimit = clampNumber(
		(record as { hardLimit?: unknown }).hardLimit,
		defaultConfig.chunking.hardLimit,
		200,
		4096,
	);

	return {
		mode: coerceEnum(
			(record as { mode?: unknown }).mode,
			CHUNKING_MODES,
			defaultConfig.chunking.mode,
		),
		targetChars,
		hardLimit: Math.max(hardLimit, targetChars),
		splitOnParagraphs: coerceBoolean(
			(record as { splitOnParagraphs?: unknown }).splitOnParagraphs,
			defaultConfig.chunking.splitOnParagraphs,
		),
		splitOnLines: coerceBoolean(
			(record as { splitOnLines?: unknown }).splitOnLines,
			defaultConfig.chunking.splitOnLines,
		),
		splitOnSentences: coerceBoolean(
			(record as { splitOnSentences?: unknown }).splitOnSentences,
			defaultConfig.chunking.splitOnSentences,
		),
		headingDelimiter: coerceString(
			(record as { headingDelimiter?: unknown }).headingDelimiter,
			defaultConfig.chunking.headingDelimiter,
		),
	};
};

const coerceConfig = (value: unknown): UserConfig => {
	if (typeof value !== "object" || value === null) {
		return defaultConfig;
	}
	const record = value as Record<string, unknown>;
	return {
		apiKey: coerceString(record.apiKey, defaultConfig.apiKey),
		model: coerceEnum(record.model, TTS_MODELS, defaultConfig.model),
		voice: coerceEnum(record.voice, TTS_VOICES, defaultConfig.voice),
		outputFormat: coerceEnum(
			record.outputFormat,
			OUTPUT_FORMATS,
			defaultConfig.outputFormat,
		),
		chunking: coerceChunking(record.chunking),
	};
};

export const useAppStore = create<AppState>()(
	persist(
		(set) => ({
			config: defaultConfig,
			setApiKey: (apiKey) =>
				set((state) => ({ config: { ...state.config, apiKey } })),
			setModel: (model) =>
				set((state) => ({ config: { ...state.config, model } })),
			setVoice: (voice) =>
				set((state) => ({ config: { ...state.config, voice } })),
			setOutputFormat: (outputFormat) =>
				set((state) => ({ config: { ...state.config, outputFormat } })),
			setChunkingMode: (mode) =>
				set((state) => ({
					config: {
						...state.config,
						chunking: { ...state.config.chunking, mode },
					},
				})),
			updateChunking: (partial) =>
				set((state) => ({
					config: {
						...state.config,
						chunking: { ...state.config.chunking, ...partial },
					},
				})),
			resetConfig: () => set({ config: defaultConfig }),
			hydrateConfig: (config) => set({ config: coerceConfig(config) }),
		}),
		{
			name: "valeon-tts-config",
			partialize: (state) => ({ config: state.config }),
		},
	),
);
