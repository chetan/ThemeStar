import * as vscode from 'vscode';

const oldFavoritesKey = "favorites";
const favoritesKey = "newFavorites";

interface Favorite {
	extensionId: string;
	name: string; // label
	isDark: boolean;
}

export function activate(context: vscode.ExtensionContext) {

	let outputChannel = vscode.window.createOutputChannel("ThemeStar");

	context.globalState.setKeysForSync([oldFavoritesKey, favoritesKey]);

	// initialize state, if needed
	let oldFavorites: string[] | undefined = context.globalState.get(oldFavoritesKey);
	let favorites: Favorite[] = ((): Favorite[] => {
		let favs: Favorite[] | undefined = context.globalState.get(favoritesKey);
		if (favs) {
			return favs;
		}
		favs = [];
		context.globalState.update(favoritesKey, favs);
		return favs;
	})();

	function getAllThemes(): { [name: string]: Favorite } {
		const themes: { [name: string]: Favorite } = {};

		vscode.extensions.all.forEach(ext => {
			// outputChannel.appendLine(`ext: ${ext.id}; kind: ${ext.extensionKind.toLocaleString()}`);
			const contributesThemes = ext.packageJSON.contributes ? (ext.packageJSON.contributes.themes ? ext.packageJSON.contributes.themes : undefined) : undefined;
			if (contributesThemes) {
				for (var i = 0; i < contributesThemes.length; i++) {
					const label = contributesThemes[i].label;
					const uiTheme = (contributesThemes[i].uiTheme === 'vs-dark') ? 'dark' : 'light';
					// const extensionType = ext.packageJSON.isBuiltin ? 'Built-in' : 'External';
					// outputChannel.appendLine(`${extensionType} extension '${ext.id}' contributes ${uiTheme} theme '${label}'`);
					themes[label] = {
						extensionId: ext.id,
						name: label,
						isDark: uiTheme === 'dark'
					};
				}
			}
		});

		return themes;
	}

	/**
	 * Migrate favorites from the old string[] format to the new Favorite[] format
	 */
	function migrateFavorites() {
		const themes = getAllThemes();

		oldFavorites?.forEach((themeName) => {
			// find in themes and add to new favs
			const theme = themes[themeName];
			if (theme) {
				favorites.push(theme);
			}
		});
		outputChannel.appendLine("migrated favorites: " + JSON.stringify(favorites));

		context.globalState.update(oldFavoritesKey, undefined);
		context.globalState.update(favoritesKey, favorites);
	}

	if (oldFavorites?.length) {
		migrateFavorites();
	}

	// Add current theme as favorite
	context.subscriptions.push(
		vscode.commands.registerCommand('themestar.addFavorite', async () => {
			// outputChannel.appendLine("current theme: " + JSON.stringify(vscode.window.activeColorTheme));
			const currentTheme: string | undefined = await vscode.workspace.getConfiguration().get("workbench.colorTheme");
			if (!currentTheme) {
				vscode.window.showWarningMessage('ThemeStar: failed to get current theme');
				return null;
			}
			if (favorites.find((fav) => fav.name === currentTheme)) {
				// already exists
				// vscode.window.showInformationMessage('Saved theme ' + currentTheme);
				return;
			}

			const themes = getAllThemes();
			const theme = themes[currentTheme];
			if (theme) {
				favorites.push(theme);
				context.globalState.update(favoritesKey, favorites);
				// vscode.window.showInformationMessage('Saved theme ' + currentTheme);
			}
		})
	);

	// Remove current theme from favorites
	context.subscriptions.push(
		vscode.commands.registerCommand('themestar.removeFavorite', async () => {
			const currentTheme: string | undefined = await vscode.workspace.getConfiguration().get("workbench.colorTheme");
			if (!currentTheme) {
				vscode.window.showWarningMessage('ThemeStar: failed to get current theme');
				return;
			}
			favorites = favorites.filter((v) => v.name !== currentTheme);
			context.globalState.update(favoritesKey, favorites);
		})
	);

	function favsToQuickPickItems(previousTheme: string, dark: boolean): vscode.QuickPickItem[] {
		const label = dark ? "Dark Themes" : "Light Themes";
		return favorites.filter((fav) => fav && fav.isDark === dark).sort((a, b) => a.name.localeCompare(b.name)).flatMap((fav, i) => {
			const picked = fav.name === previousTheme;
			if (i === 0) {
				return [{ label, kind: vscode.QuickPickItemKind.Separator }, { label: fav.name, picked }];
			}
			return { label: fav.name, picked };
		});
	}

	const noFaves = "No favorites yet";

	function createQuickPick(previousTheme: string) {
		const quickPick = vscode.window.createQuickPick();

		let items: vscode.QuickPickItem[];
		// add light themes
		items = favsToQuickPickItems(previousTheme, false);
		// add dark themes
		items = items.concat(favsToQuickPickItems(previousTheme, true));
		if (favorites.length) {
			// add light themes
			items = favsToQuickPickItems(previousTheme, false);
			// add dark themes
			items = items.concat(favsToQuickPickItems(previousTheme, true));
		} else {
			items = [{ label: noFaves, alwaysShow: true }];
		}

		quickPick.items = items;
		return quickPick;
	}

	// select from favorites
	context.subscriptions.push(
		vscode.commands.registerCommand('themestar.selectFavorite', async () => {
			// vscode.extensions.onDidChange(() => {
			// 	outputChannel.appendLine("extensions.all changed!!! dumping again");
			// 	dumpExtList();
			// });
			const previousTheme: string = await vscode.workspace.getConfiguration().get("workbench.colorTheme") || "";
			let changed = false;
			const quickPick = createQuickPick(previousTheme);
			quickPick.activeItems = quickPick.items.filter((item) => item.picked);

			quickPick.onDidChangeSelection(sel => {
				if (sel[0]) {
					const newTheme = sel[0].label;
					if (newTheme !== noFaves) {
						changeTheme(newTheme);
						changed = true;
					}
					quickPick.hide();
				}
			});

			// When selection changes but not yet confirmed
			quickPick.onDidChangeActive(sel => {
				if (sel[0]) {
					const newTheme = sel[0].label;
					if (newTheme !== noFaves) {
						changeTheme(newTheme);
					}
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

	// remove multiple selections from favorites
	context.subscriptions.push(
		vscode.commands.registerCommand('themestar.removeFavoriteList', async () => {
			const previousTheme: string = await vscode.workspace.getConfiguration().get("workbench.colorTheme") || "";
			const quickPick = createQuickPick(previousTheme);
			quickPick.canSelectMany = true;

			let finished = false;
			function done() {
				if (finished) {
					return; // don't run twice
				}
				finished = true;
				quickPick.selectedItems.forEach((item) => {
					favorites = favorites.filter((v) => v && v.name !== item.label);
				});
				context.globalState.update(favoritesKey, favorites);
				quickPick.dispose();
			}
			quickPick.onDidAccept(done);
			quickPick.onDidHide(done);

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
