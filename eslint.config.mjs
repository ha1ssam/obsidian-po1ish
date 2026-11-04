import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

// As mesmas regras que a revisão de plugins do Obsidian usa.
export default tseslint.config(
	{ ignores: ["main.js", "node_modules/**", "worker/**", "esbuild.config.mjs", "eslint.config.mjs"] },
	...obsidianmd.configs.recommended,
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: { project: "./tsconfig.json" },
		},
	}
);
