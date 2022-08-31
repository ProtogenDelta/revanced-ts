import axios from "axios";
import { red } from "chalk"
import { createWriteStream, existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { finished } from "stream/promises";
import { lookup } from "dns/promises";

const cliApiRoute = "https://api.github.com/repos/revanced/revanced-cli/releases/latest";
const patchesApiRoute = "https://api.github.com/repos/revanced/revanced-patches/releases/latest";
const integrationsApiRoute = "https://api.github.com/repos/revanced/revanced-integrations/releases/latest";

type VersionData = {
	cli: string | "unknown",
	patches: string | "unknown",
	integrations: string | "unknown",
}

export async function updateResources() {
	let installed = await getInstalledVersions();

	let cliData = (await axios.get(cliApiRoute).catch(handleFetchErr))?.data;
	let cliVer = cliData?.name;

	let patchesData = (await axios.get(patchesApiRoute).catch(handleFetchErr))?.data;
	let patchesVer = patchesData.name;
	
	let integrationsData = (await axios.get(integrationsApiRoute).catch(handleFetchErr))?.data;
	let integrationsVer = integrationsData.name;

	if(!existsSync("./data/cli.jar")) {
		console.log("Missing CLI, downloading...");
		await downloadFile(cliData.assets[0].browser_download_url, "./data/cli.jar");
		installed.cli = cliVer;
		console.log("OK!");
	} else if(cliVer != installed.cli) {
		console.log(`Latest CLI ${cliVer} does not match ${installed.cli}, downloading...`);
		await downloadFile(cliData.assets[0].browser_download_url, "./data/cli.jar");
		installed.cli = cliVer;
		console.log("OK!");
	} else {
		console.log("CLI Up to Date:",installed.cli);
	}

	if(!existsSync("./data/patches.jar") || !existsSync("./data/patches.json")) {
		console.log("Missing Patches, downloading...");
		await downloadFile(patchesData.assets[0].browser_download_url, "./data/patches.json");
		await downloadFile(patchesData.assets[1].browser_download_url, "./data/patches.jar");
		installed.patches = patchesVer;
		console.log("OK!");
	} else if(patchesVer != installed.patches) {
		console.log(`Latest Patches ${patchesVer} does not match ${installed.patches}, downloading...`);
		await downloadFile(patchesData.assets[0].browser_download_url, "./data/patches.json");
		await downloadFile(patchesData.assets[1].browser_download_url, "./data/patches.jar");
		installed.patches = patchesVer;
		console.log("OK!");
	} else {
		console.log("Patches Up to Date:",installed.patches);
	}

	if(!existsSync("./data/integrations.apk")) {
		console.log("Missing Integrations, downloading...");
		await downloadFile(integrationsData.assets[0].browser_download_url, "./data/integrations.apk");
		installed.integrations = integrationsVer;
		console.log("OK!");
	} else if(integrationsVer != installed.integrations) {
		console.log(`Latest Integrations ${integrationsVer} does not match ${installed.integrations}, downloading...`);
		await downloadFile(integrationsData.assets[0].browser_download_url, "./data/integrations.apk");
		installed.integrations = integrationsVer;
		console.log("OK!");
	} else {
		console.log("Integrations Up to Date:",installed.integrations);
	}

	await writeFile("./data/versions.json", JSON.stringify(installed), "utf8");
}

export async function checkConnection() {
	return await lookup("github.com").then(() => true).catch(() => false);
}

export async function getInstalledVersions(): Promise<VersionData> {
	let installed: VersionData = {
		cli: "unknown",
		patches: "unknown",
		integrations: "unknown"
	}

	if(existsSync("./data/versions.json")) {
		installed = JSON.parse((await readFile("./data/versions.json")).toString());
	}

	return installed;
}

async function downloadFile(url: string, filename: string) {
	let stream = createWriteStream(filename);
	let file = await axios.get(url, {responseType: "stream"});
	file.data.pipe(stream);
	finished(stream);
}

function handleFetchErr(reason: any) {
	console.log(red.bold("Oops! ")+"Something went wrong.")
	console.log(reason);
	process.exit(1);
}