import type { ChunkingConfig } from "../store/useAppStore";
import { VALEON_CHUNKING_PRESET } from "../store/useAppStore";

type SpeechSegment = {
	block: "heading" | "body";
	text: string;
};

type SectionBucket = {
	heading?: string;
	paragraphs: string[];
};

const VALEON_SECTION_CHAR_LIMIT = 4096;

const normalizeLine = (line: string) => line.replace(/[ \t]+/g, " ").trim();

export const normalizeText = (input: string) => {
	const cleaned = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	const lines = cleaned.split("\n").map(normalizeLine);
	return lines.join("\n").trim();
};

export const parseYamlFrontmatter = (input: string) => {
	const normalized = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	const lines = normalized.split("\n");
	if (lines.length < 2) {
		return null;
	}
	if (lines[0].trim() !== "---") {
		return null;
	}
	for (let index = 1; index < lines.length; index += 1) {
		const trimmed = lines[index].trim();
		if (trimmed === "---" || trimmed === "...") {
			return {
				frontmatter: lines.slice(0, index + 1).join("\n"),
				body: lines.slice(index + 1).join("\n"),
				endLine: index + 1,
			};
		}
	}
	return null;
};

export const stripYamlFrontmatter = (input: string) => {
	const parsed = parseYamlFrontmatter(input);
	if (!parsed) {
		return input;
	}
	return parsed.body.replace(/^\n+/, "");
};

const splitSentences = (text: string) => {
	const parts = text.split(/([.!?])\s+/);
	const sentences: string[] = [];
	for (let index = 0; index < parts.length; index += 2) {
		const body = parts[index] ?? "";
		const punctuation = parts[index + 1] ?? "";
		const sentence = `${body}${punctuation}`.trim();
		if (sentence) {
			sentences.push(sentence);
		}
	}
	return sentences;
};

type HeadingMatcher =
	| {
			kind: "regex";
			regex: RegExp;
	  }
	| {
			kind: "tokens";
			tokens: string[];
	  };

type HeadingMatcherResult = {
	matcher: HeadingMatcher | null;
	error: string | null;
};

const parseHeadingMatcher = (input: string): HeadingMatcherResult => {
	const trimmed = input.trim();
	if (!trimmed) {
		return { matcher: null, error: null };
	}

	if (trimmed.startsWith("/") && trimmed.lastIndexOf("/") > 0) {
		const lastSlash = trimmed.lastIndexOf("/");
		const pattern = trimmed.slice(1, lastSlash);
		const flags = trimmed.slice(lastSlash + 1);
		try {
			const regex = new RegExp(pattern, flags);
			return { matcher: { kind: "regex", regex }, error: null };
		} catch {
			return { matcher: null, error: "Invalid regex delimiter." };
		}
	}

	const tokens = trimmed
		.split(",")
		.map((token) => token.trim())
		.filter(Boolean);

	if (!tokens.length) {
		return { matcher: null, error: null };
	}

	return { matcher: { kind: "tokens", tokens }, error: null };
};

const matchTokenHeading = (line: string, token: string) => {
	const normalized = token.trim();
	if (!normalized) {
		return null;
	}
	if (/^#+$/.test(normalized)) {
		const level = normalized.length;
		const match = line.match(new RegExp(`^#{${level},6}\\s+(.+)$`));
		return match?.[1]?.trim() ?? null;
	}
	if (!line.startsWith(normalized)) {
		return null;
	}
	const remainder = line.slice(normalized.length).trim();
	return remainder || null;
};

const matchHeadingLine = (line: string, matcher: HeadingMatcher | null) => {
	if (!matcher) {
		return null;
	}
	const trimmed = line.trim();
	if (!trimmed) {
		return null;
	}
	if (matcher.kind === "regex") {
		const match = trimmed.match(matcher.regex);
		if (!match) {
			return null;
		}
		if (match.groups?.text) {
			return match.groups.text.trim();
		}
		if (match[1]) {
			return match[1].trim();
		}
		return match[0].trim();
	}

	for (const token of matcher.tokens) {
		const text = matchTokenHeading(trimmed, token);
		if (text) {
			return text;
		}
	}

	return null;
};

export const getHeadingMatcherInfo = (input: string) => {
	const { matcher, error } = parseHeadingMatcher(input);
	if (!matcher) {
		return { kind: null, error };
	}
	if (matcher.kind === "regex") {
		return { kind: "regex", error, pattern: matcher.regex.toString() };
	}
	return { kind: "tokens", error, tokens: matcher.tokens };
};

export const getHeadingMatch = (line: string, input: string) => {
	const { matcher } = parseHeadingMatcher(input);
	return matchHeadingLine(line, matcher);
};

const buildSegmentsFromText = (
	text: string,
	headingDelimiter: string,
): SpeechSegment[] => {
	const segments: SpeechSegment[] = [];
	const lines = text.split("\n");
	let paragraphLines: string[] = [];
	const { matcher } = parseHeadingMatcher(headingDelimiter);

	const flushParagraph = () => {
		const paragraph = paragraphLines.join(" ").trim();
		if (paragraph) {
			segments.push({ block: "body", text: paragraph });
		}
		paragraphLines = [];
	};

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) {
			flushParagraph();
			continue;
		}

		const headingText = matchHeadingLine(trimmed, matcher);
		if (headingText) {
			flushParagraph();
			segments.push({ block: "heading", text: headingText });
			continue;
		}

		paragraphLines.push(trimmed);
	}

	flushParagraph();

	if (!segments.length) {
		const trimmed = text.trim();
		if (trimmed) {
			segments.push({ block: "body", text: trimmed });
		}
	}

	return segments;
};

const renderTranscript = (segments: SpeechSegment[]) =>
	segments
		.map((segment) => segment.text)
		.join("\n\n")
		.trim();

const buildSections = (segments: SpeechSegment[]): SectionBucket[] => {
	const sections: SectionBucket[] = [];
	let current: SectionBucket | null = null;

	const ensureSection = () => {
		if (!current) {
			current = { paragraphs: [] };
			sections.push(current);
		}
		return current;
	};

	for (const segment of segments) {
		if (segment.block === "heading") {
			const headingText = segment.text.trim();
			current = { heading: headingText, paragraphs: [] };
			sections.push(current);
			continue;
		}

		const target = ensureSection();
		const text = segment.text.trim();
		if (text) {
			target.paragraphs.push(text);
		}
	}

	if (!sections.length) {
		sections.push({ paragraphs: [] });
	}

	return sections;
};

const chunkParagraphs = (paragraphs: string[], maxChars: number): string[] => {
	const chunks: string[] = [];
	let buffer = "";

	const flush = () => {
		if (!buffer.trim()) {
			return;
		}
		chunks.push(buffer.trim());
		buffer = "";
	};

	for (const paragraph of paragraphs) {
		const text = paragraph.trim();
		if (!text) {
			continue;
		}

		if (text.length > maxChars) {
			flush();
			const splits = splitLongParagraph(text, maxChars);
			chunks.push(...splits);
			continue;
		}

		if (!buffer) {
			buffer = text;
			continue;
		}

		if (buffer.length + 2 + text.length <= maxChars) {
			buffer = `${buffer}\n\n${text}`;
		} else {
			flush();
			buffer = text;
		}
	}

	flush();
	return chunks;
};

const splitLongParagraph = (text: string, maxChars: number): string[] => {
	const sentences = splitSentences(text);
	const parts: string[] = [];
	let current = "";

	for (const sentence of sentences) {
		const chunk = sentence.trim();
		if (!chunk) {
			continue;
		}
		if (chunk.length > maxChars) {
			if (current) {
				parts.push(current.trim());
				current = "";
			}
			parts.push(...splitArbitrarily(chunk, maxChars));
			continue;
		}
		if (!current) {
			current = chunk;
			continue;
		}
		if (current.length + 1 + chunk.length <= maxChars) {
			current = `${current} ${chunk}`;
		} else {
			parts.push(current.trim());
			current = chunk;
		}
	}

	if (current.trim()) {
		parts.push(current.trim());
	}

	return parts.length ? parts : splitArbitrarily(text, maxChars);
};

const splitArbitrarily = (text: string, maxChars: number): string[] => {
	const parts: string[] = [];
	let start = 0;
	while (start < text.length) {
		parts.push(text.slice(start, start + maxChars).trim());
		start += maxChars;
	}
	return parts.filter(Boolean);
};

const splitUnits = (
	text: string,
	rules: Omit<ChunkingConfig, "mode" | "headingDelimiter">,
) => {
	let units = [text];
	if (rules.splitOnParagraphs) {
		units = units.flatMap((unit) => unit.split(/\n{2,}/));
	}
	if (rules.splitOnLines) {
		units = units.flatMap((unit) => unit.split(/\n/));
	}
	if (rules.splitOnSentences) {
		units = units.flatMap((unit) => splitSentences(unit));
	}
	return units.map((unit) => unit.trim()).filter(Boolean);
};

const splitByLength = (text: string, limit: number) => {
	const slices: string[] = [];
	for (let index = 0; index < text.length; index += limit) {
		slices.push(text.slice(index, index + limit));
	}
	return slices;
};

const chunkValeonText = (
	text: string,
	maxChars: number,
	headingDelimiter: string,
) => {
	const segments = buildSegmentsFromText(text, headingDelimiter);
	if (!segments.length) {
		return [];
	}

	const totalChars = segments.reduce(
		(sum, segment) => sum + segment.text.length,
		0,
	);
	const hasHeadings = segments.some(
		(segment) => segment.block === "heading" && segment.text.trim(),
	);

	if (!hasHeadings && totalChars <= VALEON_SECTION_CHAR_LIMIT) {
		const transcript = renderTranscript(segments);
		if (!transcript) {
			return [];
		}
		if (transcript.length <= maxChars) {
			return [transcript];
		}
		return splitLongParagraph(transcript, maxChars);
	}

	const sections = buildSections(segments);
	const chunks: string[] = [];

	for (const section of sections) {
		if (section.heading) {
			chunks.push(section.heading);
		}
		if (!section.paragraphs.length) {
			continue;
		}

		const sectionText = section.paragraphs.join("\n\n").trim();
		if (!sectionText) {
			continue;
		}

		const fitsSingleChunk =
			sectionText.length <= VALEON_SECTION_CHAR_LIMIT &&
			sectionText.length <= maxChars;

		if (fitsSingleChunk) {
			chunks.push(sectionText);
			continue;
		}

		const paragraphChunks = chunkParagraphs(section.paragraphs, maxChars);
		chunks.push(...paragraphChunks);
	}

	return chunks;
};

const splitByHeadings = (text: string, headingDelimiter: string) => {
	const { matcher } = parseHeadingMatcher(headingDelimiter);
	if (!matcher) {
		return [{ heading: undefined, body: text }];
	}

	const lines = text.split("\n");
	const sections: Array<{ heading?: string; body: string }> = [];
	let bodyLines: string[] = [];

	for (const line of lines) {
		const headingText = matchHeadingLine(line, matcher);
		if (headingText) {
			if (bodyLines.length) {
				sections.push({ body: bodyLines.join("\n") });
			}
			sections.push({ heading: headingText, body: "" });
			bodyLines = [];
			continue;
		}
		bodyLines.push(line);
	}

	if (bodyLines.length) {
		sections.push({ body: bodyLines.join("\n") });
	}

	if (!sections.length) {
		sections.push({ heading: undefined, body: text });
	}

	return sections;
};

const chunkByRules = (
	text: string,
	rules: Omit<ChunkingConfig, "mode" | "headingDelimiter">,
) => {
	const targetChars = Math.min(rules.targetChars, rules.hardLimit);
	const units = splitUnits(text, rules);
	const chunks: string[] = [];
	let current = "";

	const flush = () => {
		if (current.trim()) {
			chunks.push(current.trim());
		}
		current = "";
	};

	for (const unit of units) {
		if (unit.length > rules.hardLimit) {
			flush();
			const sliced = splitByLength(unit, rules.hardLimit);
			chunks.push(...sliced.map((piece) => piece.trim()).filter(Boolean));
			continue;
		}

		const separator = current ? " " : "";
		if (current.length + separator.length + unit.length <= targetChars) {
			current += `${separator}${unit}`;
			continue;
		}

		flush();
		current = unit;
	}

	flush();
	return chunks;
};

export const chunkText = (text: string, config: ChunkingConfig) => {
	if (!text.trim()) {
		return [];
	}
	if (config.mode === "valeon") {
		const headingDelimiter =
			config.headingDelimiter ?? VALEON_CHUNKING_PRESET.headingDelimiter;
		return chunkValeonText(
			text,
			VALEON_CHUNKING_PRESET.hardLimit,
			headingDelimiter,
		);
	}

	const {
		headingDelimiter: rawHeadingDelimiter,
		mode: _mode,
		...ruleSet
	} = config;
	const headingDelimiter = rawHeadingDelimiter ?? "";
	if (headingDelimiter.trim()) {
		const sections = splitByHeadings(text, headingDelimiter);
		const chunks: string[] = [];
		for (const section of sections) {
			if (section.heading) {
				chunks.push(section.heading.trim());
			}
			if (section.body.trim()) {
				chunks.push(...chunkByRules(section.body, ruleSet));
			}
		}
		return chunks.filter(Boolean);
	}

	return chunkByRules(text, ruleSet);
};

export const getTextStats = (text: string, chunks: string[]) => {
	const trimmed = text.trim();
	if (!trimmed) {
		return { characters: 0, words: 0, chunks: 0, minutes: 0 };
	}
	const words = trimmed.split(/\s+/).filter(Boolean).length;
	const minutes = words / 155;
	return {
		characters: trimmed.length,
		words,
		chunks: chunks.length,
		minutes,
	};
};
