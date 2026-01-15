import type { OutputFormat, TtsModel, TtsVoice } from "../store/useAppStore";

type SpeechRequest = {
	apiKey: string;
	model: TtsModel;
	voice: TtsVoice;
	format: OutputFormat;
	input: string;
};

const AUDIO_MIME_BY_FORMAT: Record<OutputFormat, string> = {
	mp3: "audio/mpeg",
	aac: "audio/aac",
	opus: "audio/opus",
	flac: "audio/flac",
	wav: "audio/wav",
};

const OPENAI_TTS_URL = "https://api.openai.com/v1/audio/speech";

const parseOpenAiError = async (response: Response) => {
	const contentType = response.headers.get("content-type") ?? "";
	if (contentType.includes("application/json")) {
		const payload = (await response.json().catch(() => null)) as unknown;
		if (payload && typeof payload === "object") {
			let message: string | undefined;
			if (
				"error" in payload &&
				typeof payload.error === "object" &&
				payload.error &&
				"message" in payload.error &&
				typeof payload.error.message === "string"
			) {
				message = payload.error.message;
			} else if ("message" in payload && typeof payload.message === "string") {
				message = payload.message;
			}
			if (message) {
				return message;
			}
		}
	}
	const fallback = await response.text().catch(() => "");
	return fallback || `Request failed with status ${response.status}.`;
};

export const requestSpeech = async ({
	apiKey,
	model,
	voice,
	format,
	input,
}: SpeechRequest) => {
	const response = await fetch(OPENAI_TTS_URL, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model,
			voice,
			input,
			response_format: format,
		}),
	});

	if (!response.ok) {
		const message = await parseOpenAiError(response);
		throw new Error(message);
	}

	const buffer = await response.arrayBuffer();
	return new Blob([buffer], { type: AUDIO_MIME_BY_FORMAT[format] });
};
