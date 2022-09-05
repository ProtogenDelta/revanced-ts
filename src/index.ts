import { existsSync, mkdirSync, readdirSync} from "fs";
import prompts = require("prompts");
import {red, grey } from "chalk";
import {spawn} from "child_process";
import { getCompatiblePatches } from "./patches";
import { Apk } from "node-apk";
import { checkConnection, getInstalledVersions, updateResources } from "./update";

// grumble grumble no top level await grumble grumble
main();

async function main() {
	if(!existsSync("./data")) {
		mkdirSync("./data");
		mkdirSync("./data/apks");
		mkdirSync("./data/patched");
	}

	if(await checkConnection()) {
		await updateResources();
	} else {
		let installedVers = await getInstalledVersions();
		if(Object.values(installedVers).includes("unknown")) {
			console.log(red.bold("Whoops! ")+"Can't run in offline mode without all assets downloaded first.");
			process.exit(1);
		}
		console.log(red.bold("Heads Up! ")+"You're offline, and might not be installing the latest patches.");
	}

	if(!readdirSync("./data/apks").length) {
		console.log(red.bold("No APKs found. ")+"Add some to "+grey("./data/apks")+" and try again.");
		process.exit(1);
	}

	let apk = await prompts([
		{
			type: "select",
			name: "path",
			message: "Select APK",
			choices: readdirSync("./data/apks", {withFileTypes: true}).filter(e => e.isFile).map(e => {return {title: e.name, value: e.name}})
		}
	]);

	let data = new Apk("./data/apks/"+apk.path);
	let manifest = await data.getManifestInfo();
	data.close();
	let compatiblePatches = await getCompatiblePatches(manifest);
	if(compatiblePatches.length == 0) {
		console.log(red.bold("No compatible patches ")+"for "+grey(manifest.package+" v"+manifest.versionName));
		process.exit(1);
	}

	let opts = await prompts([
		{
			type: "confirm",
			name: "useIntegrations",
			message: "Use Integrations",
			initial: true
		},
		{
			type: "confirm",
			name: "adb",
			message: "Use ADB"
		},
		{
			type: (_, opts) => opts.adb ? "confirm" : null,
			name: "root",
			message: "Use Root (mount)"
		},
		{
			type: (_, opts) => opts.adb ? "text" : null,
			name: "deviceId",
			message: "Device ID"
		}
	]);

	if(opts.adb && !opts.root)
		console.log(red.bold("Heads Up! ")+"You might need to uninstall the app first for automatic installation to work.");
	else if(opts.root && manifest.package == "com.google.android.youtube")
		console.log(red.bold("Heads Up! ")+"Since you've enabled root, the "+grey("microg-support")+" patch is automatically excluded.");
	else if(opts.root && manifest.package == "com.google.android.apps.youtube.music")
		console.log(red.bold("Heads Up! ")+"Since you've enabled root, the "+grey("music-microg-support")+" patch is automatically excluded.");

	let excludePatches = compatiblePatches.filter(v => !v.excluded).map(v => [{title: v.name, description: v.description}][0]);
	let includePatches = compatiblePatches.filter(v => v.excluded).map(v => [{title: v.name, description: v.description}][0]);

	let patchOpts = await prompts([
		{
			type: excludePatches.length ? "multiselect" : null,
			name: "exclude",
			message: "Exclude Patches",
			choices: excludePatches,
			instructions: false,
		},
		{
			type: includePatches.length ? "multiselect" : null,
			name: "include",
			message: "Include Patches",
			choices: includePatches,
			instructions: false
		}
	]);

	let args = [
		"-jar","cli.jar",
		"-a",`apks/${apk.path}`,
		"-b","patches.jar",
		"-o",`patched/${apk.path}`
	];

	if(opts.useIntegrations) args.push("-m","integrations.apk");
	if(opts.adb) args.push("-d",opts?.deviceId);
	if(opts.root) args.push("--mount");
	if(opts.root && manifest.package == "com.google.android.youtube") args.push("-e","microg-support");
	else if(opts.root && manifest.package == "com.google.android.apps.youtube.music") args.push("-e","music-microg-support");

	// overkill simplification thanks to Palm#0683 on Discord
	const patchOptsExists = (key: `${'in' | 'ex'}clude`) => !!patchOpts[key]?.length
	const addPatchArgs = (flag: string, patches: string[]) => patches.forEach((p: string) => args.push(flag, p));

	if(patchOptsExists("exclude")) addPatchArgs("-e", patchOpts.exclude);
	if(patchOptsExists("include")) addPatchArgs("-i", patchOpts.include);

	// console.log(args);

	let javaProcess = spawn("java", args, {cwd: "./data"});

	javaProcess.stdout.on("data", (data) => {
		console.log(data.toString().trimEnd());
	});

	javaProcess.stderr.on("data", (data) => {
		console.log(data.toString().trimEnd());
	});

	javaProcess.on("close", (code) => {
		console.log(grey("Java process exit with code "+code));
	})
}