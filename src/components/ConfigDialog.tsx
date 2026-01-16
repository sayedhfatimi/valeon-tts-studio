import { type ChangeEvent, useMemo, useRef, useState } from "react";
import { downloadJson } from "../lib/download";
import { getHeadingMatch, getHeadingMatcherInfo } from "../lib/text";
import {
	OUTPUT_FORMATS,
	TTS_MODELS,
	TTS_VOICES,
	useAppStore,
	VALEON_CHUNKING_PRESET,
} from "../store/useAppStore";

const integerFormat = new Intl.NumberFormat("en-US");
const formatChars = (value: number) => integerFormat.format(value);

type ConfigDialogProps = {
	isOpen: boolean;
	onClose: () => void;
	rawText: string;
};

const ConfigDialog = ({ isOpen, onClose, rawText }: ConfigDialogProps) => {
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
	const [showKey, setShowKey] = useState(false);
	const [importNotice, setImportNotice] = useState<string | null>(null);
	const importInputRef = useRef<HTMLInputElement>(null);

	const isValeonMode = config.chunking.mode === "valeon";
	const activeRules = isValeonMode
		? {
				...VALEON_CHUNKING_PRESET,
				headingDelimiter:
					config.chunking.headingDelimiter ??
					VALEON_CHUNKING_PRESET.headingDelimiter,
			}
		: config.chunking;
	const headingMatcherInfo = useMemo(
		() => getHeadingMatcherInfo(config.chunking.headingDelimiter ?? ""),
		[config.chunking.headingDelimiter],
	);
	const headingPreviewLines = useMemo(() => {
		if (!isOpen || !rawText.trim()) {
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
	}, [config.chunking.headingDelimiter, isOpen, rawText]);

	const handleDownloadConfig = () => {
		downloadJson("valeon-tts-config.json", config);
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

	if (!isOpen) {
		return null;
	}

	return (
		<div className="modal modal-open">
			<div className="modal-box my-6 max-w-3xl">
				<div className="flex flex-row items-center justify-between gap-4">
					<div>
						<h2 className="text-lg font-semibold">Configuration</h2>
						<p className="text-sm opacity-70 hidden md:block">
							Store your API key locally and tune the synthesis target.
						</p>
					</div>
					<div className="flex flex-row items-center gap-2">
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
							onClick={onClose}
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
										setModel(event.target.value as (typeof TTS_MODELS)[number])
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
										setVoice(event.target.value as (typeof TTS_VOICES)[number])
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
										setChunkingMode(event.target.value as "valeon" | "custom")
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
									<p className="mt-2 text-error">{headingMatcherInfo.error}</p>
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
											<div key={item.id} className="flex items-start gap-2">
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
										Paragraphs {activeRules.splitOnParagraphs ? "on" : "off"}
									</span>
									<span className="badge badge-ghost">
										Lines {activeRules.splitOnLines ? "on" : "off"}
									</span>
									<span className="badge badge-ghost">
										Sentences {activeRules.splitOnSentences ? "on" : "off"}
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
				onClick={onClose}
			/>
		</div>
	);
};

export default ConfigDialog;
