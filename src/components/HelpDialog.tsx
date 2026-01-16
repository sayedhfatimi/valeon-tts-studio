type HelpDialogProps = {
	isOpen: boolean;
	onClose: () => void;
};

const HelpDialog = ({ isOpen, onClose }: HelpDialogProps) => {
	if (!isOpen) {
		return null;
	}

	return (
		<div className="modal modal-open">
			<div className="modal-box my-6 max-w-3xl">
				<div className="flex flex-wrap items-center md:items-start justify-between gap-4">
					<div>
						<h2 className="text-md md:text-lg font-semibold">
							Getting started
						</h2>
						<p className="text-xs md:text-sm opacity-70">
							A quick guide to move from text to audio.
						</p>
					</div>
					<button
						type="button"
						className="btn btn-sm btn-square btn-primary"
						onClick={onClose}
						aria-label="Close help dialog"
					>
						<i className="fa-solid fa-x" />
					</button>
				</div>

				<div className="mt-5 space-y-5 text-sm">
					<div className="rounded-box bg-base-200/70 p-4">
						<p className="text-xs font-semibold uppercase tracking-wide opacity-70">
							Basic steps
						</p>
						<ol className="mt-3 list-decimal space-y-2 pl-4">
							<li>
								Open Configuration and add your OpenAI API key. The app stores
								it locally in your browser.
							</li>
							<li>
								Paste text or drop a .txt or .md file into the Input section.
							</li>
							<li>
								Review the Output prep panel, then synthesize audio or download
								speechtext.
							</li>
						</ol>
					</div>

					<div className="rounded-box bg-base-200/70 p-4">
						<p className="text-xs font-semibold uppercase tracking-wide opacity-70">
							Markdown help
						</p>
						<p className="mt-3">
							When you load a Markdown file that includes YAML frontmatter, the
							app shows a Remove frontmatter button in the Input card so you can
							strip it before synthesis.
						</p>
					</div>

					<div className="rounded-box bg-base-200/70 p-4">
						<p className="text-xs font-semibold uppercase tracking-wide opacity-70">
							Config portability
						</p>
						<p className="mt-3">
							Use Download config inside Configuration to save your settings as
							JSON. Use Import config to load a saved file and restore your
							preferences.
						</p>
					</div>
				</div>
			</div>
			<button
				type="button"
				className="modal-backdrop"
				aria-label="Close help dialog"
				onClick={onClose}
			/>
		</div>
	);
};

export default HelpDialog;
