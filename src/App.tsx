import { useMutation } from "@tanstack/react-query";
import {
	type ChangeEvent,
	type DragEvent,
	useMemo,
	useRef,
	useState,
} from "react";
import ConfigDialog from "./components/ConfigDialog";
import HelpDialog from "./components/HelpDialog";
import ThemeToggle from "./components/ThemeToggle";
import { downloadBlob, downloadText } from "./lib/download";
import { requestSpeech } from "./lib/openai";
import {
	chunkText,
	getTextStats,
	normalizeText,
	parseYamlFrontmatter,
	stripYamlFrontmatter,
} from "./lib/text";
import {
	type TtsModel,
	useAppStore,
	VALEON_CHUNKING_PRESET,
} from "./store/useAppStore";

const integerFormat = new Intl.NumberFormat("en-US");
const decimalFormat = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 1,
});
const currencyFormat = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	minimumFractionDigits: 2,
	maximumFractionDigits: 4,
});

const TTS_MODEL_COST_PER_1K: Record<TtsModel, number> = {
	"tts-1": 0.015,
	"tts-1-hd": 0.03,
};

const formatMinutes = (minutes: number) =>
	minutes < 0.1 && minutes > 0 ? "<0.1" : decimalFormat.format(minutes);

const formatChars = (value: number) => integerFormat.format(value);
const formatCost = (value: number) => currencyFormat.format(value);
const isMarkdownFileName = (value: string | null) =>
	value ? value.toLowerCase().endsWith(".md") : false;

const App = () => {
	const { config } = useAppStore();
	const [rawText, setRawText] = useState("");
	const [fileName, setFileName] = useState<string | null>(null);
	const [fileNotice, setFileNotice] = useState<string | null>(null);
	const [isDragging, setIsDragging] = useState(false);
	const [isConfigOpen, setIsConfigOpen] = useState(false);
	const [isHelpOpen, setIsHelpOpen] = useState(false);
	const [synthStatus, setSynthStatus] = useState<string | null>(null);
	const [synthError, setSynthError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const normalizedText = useMemo(() => normalizeText(rawText), [rawText]);
	const chunks = useMemo(
		() => chunkText(normalizedText, config.chunking),
		[normalizedText, config.chunking],
	);
	const stats = useMemo(
		() => getTextStats(normalizedText, chunks),
		[normalizedText, chunks],
	);
	const modelCostPer1K = TTS_MODEL_COST_PER_1K[config.model];
	const estimatedCost = (stats.characters / 1000) * modelCostPer1K;
	const frontmatterInfo = useMemo(() => {
		if (!isMarkdownFileName(fileName)) {
			return null;
		}
		return parseYamlFrontmatter(rawText);
	}, [fileName, rawText]);
	const isValeonMode = config.chunking.mode === "valeon";
	const activeRules = isValeonMode
		? {
				...VALEON_CHUNKING_PRESET,
				headingDelimiter:
					config.chunking.headingDelimiter ??
					VALEON_CHUNKING_PRESET.headingDelimiter,
			}
		: config.chunking;

	const buildBaseFilename = () => {
		const fromFile = fileName?.replace(/\.(txt|md)$/i, "").trim() ?? "";
		const candidate = fromFile || "valeon-tts";
		const sanitized = candidate
			.replace(/[^A-Za-z0-9._-]+/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-+|-+$/g, "");
		return sanitized || "valeon-tts";
	};

	const synthMutation = useMutation({
		mutationFn: async () => {
			const apiKey = config.apiKey.trim();
			const sourceChunks = chunks.length ? chunks : [normalizedText];
			const total = sourceChunks.length;
			const padWidth = String(total).length;
			const baseName = buildBaseFilename();

			for (const [index, chunk] of sourceChunks.entries()) {
				setSynthStatus(`Synthesizing chunk ${index + 1} of ${total}...`);
				const blob = await requestSpeech({
					apiKey,
					model: config.model,
					voice: config.voice,
					format: config.outputFormat,
					input: chunk,
				});
				const paddedIndex = String(index + 1).padStart(padWidth, "0");
				const filename =
					total === 1
						? `${baseName}.${config.outputFormat}`
						: `${baseName}-${paddedIndex}-of-${total}.${config.outputFormat}`;
				downloadBlob(filename, blob);
			}

			return total;
		},
		onMutate: () => {
			setSynthError(null);
			setSynthStatus(null);
		},
		onSuccess: (total) => {
			setSynthStatus(
				`Synthesis complete. Downloaded ${total} file${total === 1 ? "" : "s"}.`,
			);
		},
		onError: (error) => {
			setSynthStatus(null);
			setSynthError(
				error instanceof Error
					? error.message
					: "Synthesis failed. Please try again.",
			);
		},
	});

	const handleFile = async (file: File | null | undefined) => {
		if (!file) {
			return;
		}
		const lowerName = file.name.toLowerCase();
		const isTextFile =
			file.type === "text/plain" ||
			file.type === "text/markdown" ||
			lowerName.endsWith(".txt") ||
			lowerName.endsWith(".md");
		if (!isTextFile) {
			setFileNotice("Only .txt or .md text files are supported.");
			return;
		}
		const text = await file.text();
		setRawText(text);
		setFileName(file.name);
		setFileNotice(null);
	};

	const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
		void handleFile(event.target.files?.[0]);
	};

	const handleDrop = (event: DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		setIsDragging(false);
		void handleFile(event.dataTransfer.files?.[0]);
	};

	const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		setIsDragging(true);
	};

	const handleDragLeave = () => {
		setIsDragging(false);
	};

	const handleDownloadSpeechText = () => {
		if (!normalizedText) {
			return;
		}
		downloadText("speechtext.txt", normalizedText);
	};

	const handleRemoveFrontmatter = () => {
		setRawText((value) => stripYamlFrontmatter(value));
	};

	const handleSynthesizeAudio = () => {
		setSynthError(null);
		setSynthStatus(null);
		if (!normalizedText.trim()) {
			setSynthError("Add text before synthesizing audio.");
			return;
		}
		if (!config.apiKey.trim()) {
			setSynthError("Add your OpenAI API key to start synthesis.");
			return;
		}
		if (synthMutation.isPending) {
			return;
		}
		synthMutation.mutate();
	};

	return (
		<div className="relative min-h-screen overflow-hidden font-['Space_Grotesk'] text-base-content">
			<div className="relative mx-auto flex max-w-6xl flex-col gap-8 p-2 md:px-6 md:py-10">
				<header className="flex flex-row items-center justify-between md:gap-4">
					<div className="flex flex-row items-center gap-2 md:gap-4">
						<img
							src="/logo.png"
							alt="Valeon TTS Studio logo"
							className=" size-16 md:size-32 object-contain"
						/>
						<div className="space-y-2">
							<h1 className="text-lg font-semibold tracking-tight md:text-4xl">
								Valeon TTS Studio
							</h1>
							<p className="max-w-2xl text-sm opacity-80 md:text-base hidden md:block">
								Drop a text or Markdown file or paste text, tune chunking, and
								export speechtext or audio. Everything stays in your browser
								except the TTS calls.
							</p>
						</div>
					</div>

					<div className="flex flex-row items-center gap-2">
						<ThemeToggle />
						<button
							type="button"
							className="btn btn-primary btn-sm btn-square"
							onClick={() => setIsHelpOpen(true)}
							aria-label="Open help dialog"
						>
							<i className="fa-solid fa-question" />
						</button>
						<button
							type="button"
							className="btn btn-primary btn-sm btn-square"
							onClick={() => setIsConfigOpen(true)}
						>
							<i className="fa-solid fa-sliders" />
						</button>
					</div>
				</header>

				<main className="flex flex-col gap-6">
					<section className="space-y-6">
						<div className="card border border-base-200 bg-base-100/85 shadow-xl backdrop-blur">
							<div className="card-body gap-4">
								<div className="flex flex-row items-center justify-between gap-4">
									<div>
										<h2 className="card-title">Input</h2>
										<p className="text-sm opacity-70">
											Paste text or drop a .txt or .md file. The file replaces
											the current text.
										</p>
									</div>
									<div className="flex flex-row items-center gap-2">
										{frontmatterInfo ? (
											<button
												type="button"
												className="btn btn-sm btn-outline"
												onClick={handleRemoveFrontmatter}
											>
												<i className="fa-solid fa-eraser"></i>
												Remove frontmatter
											</button>
										) : null}
										<button
											type="button"
											className="btn btn-sm btn-warning"
											onClick={() => {
												setRawText("");
												setFileName(null);
												setFileNotice(null);
											}}
										>
											<i className="fa-solid fa-x"></i>
											Clear
										</button>
									</div>
								</div>

								<textarea
									className="textarea min-h-55 w-full text-sm leading-relaxed"
									placeholder="Paste narration text or transcripts here..."
									value={rawText}
									onChange={(event) => setRawText(event.target.value)}
								/>

								<div className="flex flex-wrap items-center justify-between gap-2 text-xs">
									<div className="flex flex-wrap gap-2">
										<span className="badge badge-ghost">
											Words {formatChars(stats.words)}
										</span>
										<span className="badge badge-ghost">
											Est. minutes {formatMinutes(stats.minutes)}
										</span>
										<span className="badge badge-ghost">
											Model {config.model.toUpperCase()}
										</span>
									</div>
									{fileName ? (
										<span className="text-xs opacity-60">
											Loaded {fileName}
										</span>
									) : null}
								</div>

								<div
									className={`rounded-box border border-dashed p-4 transition ${
										isDragging
											? "border-primary bg-primary/10"
											: "border-base-300 bg-base-200/60"
									}`}
									onDragOver={handleDragOver}
									onDragLeave={handleDragLeave}
									onDrop={handleDrop}
								>
									<input
										ref={fileInputRef}
										type="file"
										accept=".txt,.md,text/plain,text/markdown"
										className="hidden"
										onChange={handleFileChange}
									/>
									<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
										<div>
											<p className="text-sm font-medium">
												Drop a text or Markdown file here
											</p>
											<p className="text-xs opacity-70">
												Text or Markdown only. Drag and drop or browse.
											</p>
										</div>
										<button
											type="button"
											className="btn btn-secondary btn-sm"
											onClick={() => fileInputRef.current?.click()}
										>
											<i className="fa-solid fa-file"></i>
											Browse file
										</button>
									</div>
									{fileNotice ? (
										<p className="mt-2 text-xs text-error">{fileNotice}</p>
									) : null}
								</div>
							</div>
						</div>

						<div className="card border border-base-200 bg-base-100/85 shadow-xl backdrop-blur">
							<div className="card-body gap-4">
								<div className="flex flex-wrap items-start justify-between gap-4">
									<div>
										<h2 className="card-title">Output prep</h2>
										<p className="text-sm opacity-70">
											Preview normalized speechtext and download intermediate
											files.
										</p>
									</div>
									<div className="flex flex-row items-center gap-1">
										<span className="badge badge-outline badge-sm">
											Model {config.model.toUpperCase()}
										</span>
										<span className="badge badge-outline badge-sm">
											Voice {config.voice}
										</span>
										<span className="badge badge-outline badge-sm">
											{config.outputFormat.toUpperCase()}
										</span>
									</div>
								</div>

								<ul className="steps steps-vertical sm:steps-horizontal">
									<li
										className={`step ${stats.characters ? "step-primary" : ""}`}
									>
										Normalize
									</li>
									<li className={`step ${stats.chunks ? "step-primary" : ""}`}>
										Chunk
									</li>
									<li
										className={`step ${
											synthMutation.isPending || synthMutation.isSuccess
												? "step-primary"
												: ""
										}`}
									>
										<span className="inline-flex items-center gap-2">
											Synthesize
											{synthMutation.isPending ? (
												<span
													className="loading loading-spinner loading-xs"
													aria-label="Synthesizing audio"
												/>
											) : null}
										</span>
									</li>
								</ul>

								<div className="stats stats-vertical bg-base-200/70 shadow sm:stats-horizontal">
									<div className="stat">
										<div className="stat-title">Chunks</div>
										<div className="stat-value text-2xl">{stats.chunks}</div>
										<div className="stat-desc">
											Target {formatChars(activeRules.targetChars)} chars
										</div>
									</div>
									<div className="stat">
										<div className="stat-title">Characters</div>
										<div className="stat-value text-2xl">
											{formatChars(stats.characters)}
										</div>
										<div className="stat-desc">Normalized input</div>
									</div>
									<div className="stat">
										<div className="stat-title">Hard limit</div>
										<div className="stat-value text-2xl">
											{formatChars(activeRules.hardLimit)}
										</div>
										<div className="stat-desc">Per chunk</div>
									</div>
									<div className="stat">
										<div className="stat-title">Estimated cost</div>
										<div className="stat-value text-2xl">
											{formatCost(estimatedCost)}
										</div>
										<div className="stat-desc">
											{config.model.toUpperCase()} at{" "}
											{formatCost(modelCostPer1K)}/1K chars
										</div>
									</div>
								</div>

								<div className="collapse collapse-arrow bg-base-200/70">
									<input type="checkbox" />
									<div className="collapse-title text-sm font-medium">
										Speechtext preview
									</div>
									<div className="collapse-content">
										<textarea
											className="textarea textarea-bordered min-h-45 w-full font-['IBM_Plex_Mono'] text-xs leading-relaxed"
											readOnly
											value={normalizedText || "No input yet."}
										/>
									</div>
								</div>

								<div className="flex flex-row gap-2">
									<button
										type="button"
										className="btn btn-primary w-1/2"
										disabled={
											synthMutation.isPending ||
											!config.apiKey ||
											!normalizedText
										}
										onClick={handleSynthesizeAudio}
									>
										{synthMutation.isPending ? (
											<span className="loading loading-spinner loading-sm" />
										) : (
											<i className="fa-solid fa-wave-square"></i>
										)}
										Synthesize audio
									</button>
									<button
										type="button"
										className="btn btn-outline w-1/2"
										disabled={!normalizedText}
										onClick={handleDownloadSpeechText}
									>
										Download speechtext
									</button>
								</div>
								{synthStatus ? (
									<p className="text-xs opacity-70">{synthStatus}</p>
								) : null}
								{synthError ? (
									<p className="text-xs text-error">{synthError}</p>
								) : null}
							</div>
						</div>
					</section>
				</main>

				<ConfigDialog
					isOpen={isConfigOpen}
					onClose={() => setIsConfigOpen(false)}
					rawText={rawText}
				/>
				<HelpDialog isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
			</div>
		</div>
	);
};

export default App;
