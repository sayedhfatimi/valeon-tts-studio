import { useMutation } from "@tanstack/react-query";
import {
	type ChangeEvent,
	type DragEvent,
	useMemo,
	useRef,
	useState,
} from "react";
import ThemeToggle from "./components/ThemeToggle";
import { downloadBlob, downloadJson, downloadText } from "./lib/download";
import { requestSpeech } from "./lib/openai";
import {
	chunkText,
	getHeadingMatch,
	getHeadingMatcherInfo,
	getTextStats,
	normalizeText,
} from "./lib/text";
import {
	OUTPUT_FORMATS,
	TTS_MODELS,
	TTS_VOICES,
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

const App = () => {
	const {
		config,
		setApiKey,
		setModel,
		setVoice,
		setOutputFormat,
		setChunkingMode,
		updateChunking,
		resetConfig,
		hydrateConfig,
	} = useAppStore();
	const [rawText, setRawText] = useState("");
	const [fileName, setFileName] = useState<string | null>(null);
	const [fileNotice, setFileNotice] = useState<string | null>(null);
	const [importNotice, setImportNotice] = useState<string | null>(null);
	const [isDragging, setIsDragging] = useState(false);
	const [isConfigOpen, setIsConfigOpen] = useState(false);
	const [showKey, setShowKey] = useState(false);
	const [synthStatus, setSynthStatus] = useState<string | null>(null);
	const [synthError, setSynthError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const importInputRef = useRef<HTMLInputElement>(null);

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
	const headingMatcherInfo = useMemo(
		() => getHeadingMatcherInfo(config.chunking.headingDelimiter ?? ""),
		[config.chunking.headingDelimiter],
	);
	const headingPreviewLines = useMemo(() => {
		if (!rawText.trim()) {
			return [];
		}
		return rawText
			.split("\n")
			.slice(0, 6)
			.map((line, index) => ({
				id: `${index}-${line}`,
				line,
				heading: getHeadingMatch(line, config.chunking.headingDelimiter ?? ""),
			}));
	}, [rawText, config.chunking.headingDelimiter]);
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
		const fromFile = fileName?.replace(/\.txt$/i, "").trim() ?? "";
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
		const isTextFile =
			file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt");
		if (!isTextFile) {
			setFileNotice("Only plaintext .txt files are supported.");
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

	const handleDownloadConfig = () => {
		downloadJson("valeon-tts-config.json", config);
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

	const handleImportConfig = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) {
			return;
		}
		try {
			const raw = await file.text();
			const parsed = JSON.parse(raw);
			hydrateConfig(parsed);
			setImportNotice("Config loaded and applied.");
		} catch {
			setImportNotice("Could not read the config file.");
		} finally {
			if (importInputRef.current) {
				importInputRef.current.value = "";
			}
		}
	};

	return (
		<div className="relative min-h-screen overflow-hidden font-['Space_Grotesk'] text-base-content">
			<div className="relative mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
				<header className="flex flex-row items-center justify-between gap-4">
					<div className="flex items-center gap-4">
						<img
							src="/logo.png"
							alt="Valeon TTS Studio logo"
							className="size-32 rounded-xl object-contain"
						/>
						<div className="space-y-2">
							<h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
								Prompt to audio, tuned for long form narration
							</h1>
							<p className="max-w-2xl text-sm opacity-80 md:text-base">
								Drop a plaintext file or paste text, tune chunking, and export
								speechtext or audio. Everything stays in your browser except the
								TTS calls.
							</p>
						</div>
					</div>

					<div className="flex flex-row items-center gap-2">
						<ThemeToggle />
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
								<div className="flex flex-wrap items-start justify-between gap-4">
									<div>
										<h2 className="card-title">Input</h2>
										<p className="text-sm opacity-70">
											Paste text or drop a .txt file. The file replaces the
											current text.
										</p>
									</div>
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
										accept=".txt,text/plain"
										className="hidden"
										onChange={handleFileChange}
									/>
									<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
										<div>
											<p className="text-sm font-medium">
												Drop a text file here
											</p>
											<p className="text-xs opacity-70">
												Plaintext only. Drag and drop or browse.
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

				{isConfigOpen ? (
					<div className="modal modal-open">
						<div className="modal-box my-6 max-w-3xl">
							<div className="flex flex-wrap items-start justify-between gap-4">
								<div>
									<h2 className="text-lg font-semibold">Configuration</h2>
									<p className="text-sm opacity-70">
										Store your API key locally and tune the synthesis target.
									</p>
								</div>
								<div className="flex flex-wrap gap-2">
									<button
										type="button"
										className="btn btn-sm btn-error"
										onClick={resetConfig}
									>
										<i className="fa-solid fa-rotate-left" />
										Reset
									</button>
									<button
										type="button"
										className="btn btn-sm btn-ghost btn-square"
										onClick={() => setIsConfigOpen(false)}
									>
										<i className="fa-solid fa-x"></i>
									</button>
								</div>
							</div>

							<div className="mt-5 space-y-5">
								<div className="flex flex-col gap-1">
									<label className="floating-label">
										<span className="label">OpenAI API key</span>
										<label className="input w-full">
											<input
												type={showKey ? "text" : "password"}
												placeholder="sk-..."
												value={config.apiKey}
												onChange={(event) => setApiKey(event.target.value)}
											/>
											<button
												type="button"
												className="btn btn-square btn-ghost btn-sm"
												onClick={() => setShowKey((value) => !value)}
											>
												{showKey ? (
													<i className="fa-solid fa-eye-slash" />
												) : (
													<i className="fa-solid fa-eye" />
												)}
											</button>
										</label>
									</label>
									<span className="text-xs opacity-70">
										Stored locally in your browser only.
									</span>
								</div>

								<div className="flex flex-col gap-3">
									<div className="flex flex-row gap-3">
										<label className="select select-sm w-full">
											<span className="label">Model</span>
											<select
												value={config.model}
												onChange={(event) =>
													setModel(
														event.target.value as (typeof TTS_MODELS)[number],
													)
												}
											>
												{TTS_MODELS.map((model) => (
													<option key={model} value={model}>
														{model.toUpperCase()}
													</option>
												))}
											</select>
										</label>
										<label className="select select-sm w-full">
											<span className="label">Voice</span>
											<select
												value={config.voice}
												onChange={(event) =>
													setVoice(
														event.target.value as (typeof TTS_VOICES)[number],
													)
												}
											>
												{TTS_VOICES.map((voice) => (
													<option key={voice} value={voice}>
														{voice}
													</option>
												))}
											</select>
										</label>
									</div>
									<label className="select select-sm w-full">
										<span className="label">Output format</span>
										<select
											value={config.outputFormat}
											onChange={(event) =>
												setOutputFormat(
													event.target.value as (typeof OUTPUT_FORMATS)[number],
												)
											}
										>
											{OUTPUT_FORMATS.map((format) => (
												<option key={format} value={format}>
													{format.toUpperCase()}
												</option>
											))}
										</select>
									</label>
								</div>

								<div className="alert alert-warning alert-soft text-xs">
									<span>
										Your key is never sent to our servers. All OpenAI calls are
										executed directly from your browser session.
									</span>
								</div>

								<div className="flex flex-row items-center gap-2">
									<button
										type="button"
										className="btn btn-outline btn-sm w-1/2"
										onClick={handleDownloadConfig}
									>
										<i className="fa-solid fa-download"></i>
										Download config
									</button>
									<label className="btn btn-outline btn-sm w-1/2">
										<i className="fa-solid fa-upload"></i>
										Import config
										<input
											ref={importInputRef}
											type="file"
											accept="application/json"
											className="hidden"
											onChange={handleImportConfig}
										/>
									</label>
								</div>
								{importNotice ? (
									<p className="text-xs opacity-70">{importNotice}</p>
								) : null}

								<div className="collapse collapse-arrow bg-base-200/70">
									<input type="checkbox" />
									<div className="collapse-title text-sm font-medium">
										Advanced chunking
									</div>
									<div className="collapse-content space-y-4 text-sm">
										<label className="select select-sm w-full">
											<span className="label">Chunking mode</span>
											<select
												value={config.chunking.mode}
												onChange={(event) =>
													setChunkingMode(
														event.target.value as "valeon" | "custom",
													)
												}
											>
												<option value="valeon">Valeon preset</option>
												<option value="custom">Custom rules</option>
											</select>
										</label>

										<label className="input input-sm w-full">
											<span className="label">Heading delimiter</span>
											<input
												type="text"
												placeholder="#"
												value={config.chunking.headingDelimiter ?? ""}
												onChange={(event) =>
													updateChunking({
														headingDelimiter: event.target.value,
													})
												}
											/>
										</label>

										<div className="rounded-box bg-base-200/70 p-3 text-xs">
											<div className="font-semibold uppercase tracking-wide opacity-70">
												Heading preview
											</div>
											{headingMatcherInfo.error ? (
												<p className="mt-2 text-error">
													{headingMatcherInfo.error}
												</p>
											) : null}
											{headingMatcherInfo.kind === "regex" ? (
												<p className="mt-2 opacity-70">
													Regex: {headingMatcherInfo.pattern}
												</p>
											) : null}
											{headingMatcherInfo.kind === "tokens" ? (
												<p className="mt-2 opacity-70">
													Prefixes: {headingMatcherInfo.tokens?.join(", ")}
												</p>
											) : null}
											{!headingPreviewLines.length ? (
												<p className="mt-2 opacity-60">
													Add text above to preview heading detection.
												</p>
											) : (
												<div className="mt-3 space-y-1 font-['IBM_Plex_Mono'] text-[11px]">
													{headingPreviewLines.map((item) => (
														<div
															key={item.id}
															className="flex items-start gap-2"
														>
															<span
																className={`badge badge-xs ${
																	item.heading ? "badge-primary" : "badge-ghost"
																}`}
															>
																{item.heading ? "Heading" : "Body"}
															</span>
															<span className="opacity-80">
																{item.line.trim() ? item.line : "(blank)"}
															</span>
														</div>
													))}
												</div>
											)}
										</div>

										<div className="grid gap-3 md:grid-cols-2">
											<label className="input input-sm">
												<span className="label">Target chars</span>
												<input
													type="number"
													min={200}
													max={4096}
													value={activeRules.targetChars}
													onChange={(event) =>
														event.target.value
															? updateChunking({
																	targetChars: Number(event.target.value),
																})
															: null
													}
													disabled={isValeonMode}
												/>
											</label>
											<label className="input input-sm">
												<span className="label">Hard limit</span>
												<input
													type="number"
													min={200}
													max={4096}
													value={activeRules.hardLimit}
													onChange={(event) =>
														event.target.value
															? updateChunking({
																	hardLimit: Number(event.target.value),
																})
															: null
													}
													disabled={isValeonMode}
												/>
											</label>
										</div>

										<div className="grid gap-3 sm:grid-cols-2">
											<label className="flex items-center gap-2">
												<input
													type="checkbox"
													className="checkbox checkbox-sm"
													checked={activeRules.splitOnParagraphs}
													onChange={(event) =>
														updateChunking({
															splitOnParagraphs: event.target.checked,
														})
													}
													disabled={isValeonMode}
												/>
												<span>Split on paragraph breaks</span>
											</label>
											<label className="flex items-center gap-2">
												<input
													type="checkbox"
													className="checkbox checkbox-sm"
													checked={activeRules.splitOnLines}
													onChange={(event) =>
														updateChunking({
															splitOnLines: event.target.checked,
														})
													}
													disabled={isValeonMode}
												/>
												<span>Split on line breaks</span>
											</label>
											<label className="flex items-center gap-2">
												<input
													type="checkbox"
													className="checkbox checkbox-sm"
													checked={activeRules.splitOnSentences}
													onChange={(event) =>
														updateChunking({
															splitOnSentences: event.target.checked,
														})
													}
													disabled={isValeonMode}
												/>
												<span>Split on sentences</span>
											</label>
										</div>

										<div className="rounded-box bg-base-300/60 p-3 text-xs">
											<div className="font-semibold uppercase tracking-wide opacity-70">
												Active rules
											</div>
											<div className="mt-2 flex flex-wrap gap-2">
												<span className="badge badge-ghost">
													Target {formatChars(activeRules.targetChars)} chars
												</span>
												<span className="badge badge-ghost">
													Hard {formatChars(activeRules.hardLimit)} chars
												</span>
												<span className="badge badge-ghost">
													Paragraphs{" "}
													{activeRules.splitOnParagraphs ? "on" : "off"}
												</span>
												<span className="badge badge-ghost">
													Lines {activeRules.splitOnLines ? "on" : "off"}
												</span>
												<span className="badge badge-ghost">
													Sentences{" "}
													{activeRules.splitOnSentences ? "on" : "off"}
												</span>
												<span className="badge badge-ghost">
													Heading{" "}
													{activeRules.headingDelimiter
														? activeRules.headingDelimiter
														: "off"}
												</span>
											</div>
											<p className="mt-2 opacity-70">
												Valeon preset mirrors the podcast workflow defaults.
											</p>
										</div>
									</div>
								</div>
							</div>
						</div>
						<button
							type="button"
							className="modal-backdrop"
							aria-label="Close configuration modal"
							onClick={() => setIsConfigOpen(false)}
						/>
					</div>
				) : null}
			</div>
		</div>
	);
};

export default App;
