const triggerDownload = (filename: string, blob: Blob) => {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
};

export const downloadBlob = (filename: string, blob: Blob) => {
	triggerDownload(filename, blob);
};

export const downloadText = (filename: string, content: string) => {
	triggerDownload(filename, new Blob([content], { type: "text/plain" }));
};

export const downloadJson = (filename: string, content: unknown) => {
	const payload = JSON.stringify(content, null, 2);
	triggerDownload(filename, new Blob([payload], { type: "application/json" }));
};
