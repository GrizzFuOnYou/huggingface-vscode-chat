import * as vscode from "vscode";
import { HuggingFaceChatModelProvider } from "./provider";

export function activate(context: vscode.ExtensionContext) {
	// Build a descriptive User-Agent to help quantify API usage
	const ext = vscode.extensions.getExtension("HuggingFace.huggingface-vscode-chat");
	const extVersion = ext?.packageJSON?.version ?? "unknown";
	const vscodeVersion = vscode.version;
	// Keep UA minimal: only extension version and VS Code version
	const ua = `huggingface-vscode-chat/${extVersion} VSCode/${vscodeVersion}`;

	const provider = new HuggingFaceChatModelProvider(context.secrets, ua);
	// Register the Hugging Face provider under the vendor id used in package.json
	context.subscriptions.push(vscode.lm.registerLanguageModelChatProvider("huggingface", provider));

	// --- Status bar item ---
	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBar.command = "huggingface.manage";
	statusBar.tooltip = "Hugging Face – click to manage API key";
	context.subscriptions.push(statusBar);

	async function updateStatusBar() {
		const key = await context.secrets.get("huggingface.apiKey");
		if (key) {
			statusBar.text = "$(hubot) HF $(check)";
			statusBar.tooltip = "Hugging Face – API key is set. Click to update.";
		} else {
			statusBar.text = "$(hubot) HF $(warning)";
			statusBar.tooltip = "Hugging Face – No API key. Click to set one.";
		}
		statusBar.show();
	}

	// Initial status bar render
	void updateStatusBar();

	// Refresh status bar whenever a secret changes
	context.subscriptions.push(
		context.secrets.onDidChange((e) => {
			if (e.key === "huggingface.apiKey") {
				void updateStatusBar();
			}
		})
	);

	// Refresh model list when relevant settings change
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (
				e.affectsConfiguration("huggingface.routing") ||
				e.affectsConfiguration("huggingface.includeNonToolModels") ||
				e.affectsConfiguration("huggingface.modelCacheTtlMinutes")
			) {
				provider.invalidateCache();
			}
		})
	);

	// Management command to configure API key
	context.subscriptions.push(
		vscode.commands.registerCommand("huggingface.manage", async () => {
			const existing = await context.secrets.get("huggingface.apiKey");
			const apiKey = await vscode.window.showInputBox({
				title: "Hugging Face API Key",
				prompt: existing ? "Update your Hugging Face API key" : "Enter your Hugging Face API key",
				ignoreFocusOut: true,
				password: true,
				value: existing ?? "",
			});
			if (apiKey === undefined) {
				return; // user canceled
			}
			if (!apiKey.trim()) {
				await context.secrets.delete("huggingface.apiKey");
				vscode.window.showInformationMessage("Hugging Face API key cleared.");
				provider.invalidateCache();
				return;
			}
			await context.secrets.store("huggingface.apiKey", apiKey.trim());
			vscode.window.showInformationMessage("Hugging Face API key saved.");
			provider.invalidateCache();
		})
	);

	// Command to clear the API key without prompting for a new one
	context.subscriptions.push(
		vscode.commands.registerCommand("huggingface.clearApiKey", async () => {
			const existing = await context.secrets.get("huggingface.apiKey");
			if (!existing) {
				vscode.window.showInformationMessage("Hugging Face: no API key is currently set.");
				return;
			}
			const confirm = await vscode.window.showWarningMessage(
				"Clear the stored Hugging Face API key?",
				{ modal: true },
				"Clear"
			);
			if (confirm !== "Clear") {
				return;
			}
			await context.secrets.delete("huggingface.apiKey");
			vscode.window.showInformationMessage("Hugging Face API key cleared.");
			provider.invalidateCache();
		})
	);

	// Command to force-refresh the model list
	context.subscriptions.push(
		vscode.commands.registerCommand("huggingface.refreshModels", () => {
			provider.invalidateCache();
			vscode.window.showInformationMessage("Hugging Face: model list will refresh on next use.");
		})
	);
}

export function deactivate() {}
