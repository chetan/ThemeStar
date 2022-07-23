import * as vscode from 'vscode';

const favoritesKey = "favorites";

export function activate(context: vscode.ExtensionContext) {

	let outputChannel = vscode.window.createOutputChannel("ThemeStar");

	context.globalState.setKeysForSync([favoritesKey]);

	// initialize state, if needed
	let favorites: string[] | undefined = context.globalState.get(favoritesKey);
	if (!favorites) {
		favorites = [];
		context.globalState.update(favoritesKey, favorites);
	}

	// Add current theme as favorite
	context.subscriptions.push(
		vscode.commands.registerCommand('themestar.addFavorite', async () => {
			let currentTheme: string | undefined = await vscode.workspace.getConfiguration().get("workbench.colorTheme");
			if (!currentTheme || !favorites) {
				vscode.window.showWarningMessage('ThemeStart: failed to get current theme');
				return;
			}
			if (favorites.includes(currentTheme)) {
				// vscode.window.showInformationMessage('Saved theme ' + currentTheme);
				return;
			}
			favorites.push(currentTheme);
			favorites.sort((a, b) => a.localeCompare(b));
			context.globalState.update(favoritesKey, favorites);
			// vscode.window.showInformationMessage('Saved theme ' + currentTheme);
		})
	);

	// Remove current theme from favorites
	context.subscriptions.push(
		vscode.commands.registerCommand('themestar.removeFavorite', async () => {
			let currentTheme: string | undefined = await vscode.workspace.getConfiguration().get("workbench.colorTheme");
			if (!currentTheme || !favorites) {
				vscode.window.showWarningMessage('ThemeStart: failed to get current theme');
				return;
			}
			favorites = favorites.filter((v) => v !== currentTheme);
			context.globalState.update(favoritesKey, favorites);
		})
	);

	// select from favorites
	context.subscriptions.push(
		vscode.commands.registerCommand('themestar.selectFavorite', async () => {
			if (!favorites) {
				return;
			}
			const previousTheme: string = await vscode.workspace.getConfiguration().get("workbench.colorTheme") || "";
			let changed = false;
			const quickPick = vscode.window.createQuickPick();
			quickPick.items = favorites.map(label => ({ label }));
			quickPick.onDidChangeSelection(sel => {
				if (sel[0]) {
					const newTheme = sel[0].label;
					changeTheme(newTheme);
					changed = true;
					quickPick.hide();
				}
			});
			// When selection changes but not yet confirmed
			quickPick.onDidChangeActive(sel => {
				if (sel[0]) {
					const newTheme = sel[0].label;
					changeTheme(newTheme);
				}
			});
			quickPick.onDidHide(() => {
				if (!changed && previousTheme) {
					changeTheme(previousTheme);
				}
				quickPick.dispose();
			});
			quickPick.show();

		})
	);

}

export function deactivate() { }

function changeTheme(newTheme: string, notify: boolean = false) {
	vscode.workspace.getConfiguration().update("workbench.colorTheme", newTheme).then(
		() => {
			if (notify) {
				vscode.window.showInformationMessage('Switched to theme ' + newTheme);
			}
		},
		(error) => {
			if (notify) {
				vscode.window.showErrorMessage("Failed to switch theme: " + error);
			}
		}
	);
}
