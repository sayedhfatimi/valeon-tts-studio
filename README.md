# Valeon TTS Studio

<p align="center">
  <img src="public/logo.png" alt="Valeon TTS Studio logo" width="180" />
</p>

<p align="center">
  <strong>Prompt to audio, tuned for long-form narration.</strong>
</p>

Valeon TTS Studio is a local-first web app for preparing long-form scripts and turning them into audio with OpenAI TTS. Paste text or drop a .txt file, tune chunking rules, review cost estimates, and export audio or normalized speechtext. Everything stays in your browser except the TTS calls.

## Table of Contents
- [About](#about)
- [Features](#features)
- [How It Works](#how-it-works)
- [Getting Started](#getting-started)
- [Usage](#usage)
- [Configuration](#configuration)
- [Scripts](#scripts)
- [Tech Stack](#tech-stack)
- [License](#license)

## About
Valeon TTS Studio focuses on reliable, production-ready narration workflows. It is optimized for long-form text with clear chunking controls, instant previews, and local configuration that never leaves your device.

## Features
- Paste text or import plaintext .txt files.
- Normalize and preview speechtext before synthesis.
- Chunking presets for long-form narration, plus custom rules.
- Model, voice, and output format selection.
- Estimated minutes and per-run cost based on OpenAI TTS pricing.
- Download audio per chunk and export/import configuration.

## How It Works
- Normalize and segment your input into chunks based on your rules.
- Estimate length and cost before synthesis.
- Send each chunk directly from the browser to OpenAI TTS.
- Download audio files with consistent, ordered filenames.

## Getting Started
```bash
npm install
npm run dev
```

## Usage
1. Paste narration text or drop a .txt file into the input area.
2. Open Configuration to add your OpenAI API key and select model, voice, and output format.
3. Review the normalized speechtext and chunk stats.
4. Click Synthesize audio to download files, or export the speechtext/config first.

## Configuration
- API keys and settings are stored locally in your browser.
- Choose between the Valeon preset or custom chunking rules.
- Export a config JSON for quick reuse on another machine or session.

## Scripts
- `npm run dev` Start the development server.
- `npm run build` Type-check and build for production.
- `npm run preview` Preview the production build locally.
- `npm run lint` Run Biome checks.
- `npm run format` Fix formatting with Biome.

## Tech Stack
- Vite + React + TypeScript
- Tailwind CSS + DaisyUI
- TanStack Query + Zustand

## License
MIT. See `LICENSE`.
