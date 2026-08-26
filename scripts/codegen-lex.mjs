import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const lexicons = [
	"com.atproto.simplespace.createSpace",
	"com.atproto.simplespace.getSpace",
	"com.atproto.space.createRecord",
	"com.atproto.space.listRecords",
	"com.atproto.space.getBlob",
	"com.atproto.repo.uploadBlob",
];

execFileSync(
	"lex",
	[
		"build",
		"--lexicons",
		fileURLToPath(new URL("../lexicons/upstream", import.meta.url)),
		"--out",
		fileURLToPath(new URL("../src/lib/lexicons", import.meta.url)),
		"--clear",
		"--index-file",
		"--import-ext",
		"",
		"--lib",
		"@atproto/lex-schema",
		"--include",
		...lexicons,
	],
	{ stdio: "inherit" },
);
