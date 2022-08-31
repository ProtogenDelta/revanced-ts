// fair warning to anyone attempting to read (or worse, use)
// this, it is a mess. I wrote it in the middle of the night
// with next to no sleep and should not be considered a
// reliable tool in the slightest. But it does what I need
// so it's good enough for me.

import axios from "axios";
import {createWriteStream, existsSync, mkdirSync, readdirSync} from "fs";
import {readFile, writeFile} from "fs/promises";
import prompts = require("prompts");
import {red, grey, bold} from "chalk";
import {spawn} from "child_process";
import { promisify } from "util";
import { finished } from "stream";
import { getCompatiblePatches } from "./patches";
import { Apk } from "node-apk";

const cliApiRoute = "https://api.github.com/repos/revanced/revanced-cli/releases/latest";
const patchesApiRoute = "https://api.github.com/repos/revanced/revanced-patches/releases/latest";
const integrationsApiRoute = "https://api.github.com/repos/revanced/revanced-integrations/releases/latest";

// grumble grumble no top level await grumble grumble
main();

async function main() {
  if(!existsSync("./data")) {
    mkdirSync("./data");
    mkdirSync("./data/apks");
    mkdirSync("./data/patched");
  }

  let cliData = (await axios.get(cliApiRoute).catch(handleFetchErr))?.data;
  let cliVer = cliData?.name;

  let patchesData = (await axios.get(patchesApiRoute)).data;
  let patchesVer = patchesData.name;
  
  let integrationsData = (await axios.get(integrationsApiRoute)).data;
  let integrationsVer = integrationsData.name;

  for (let s of ["cli", "patches", "integrations"]) {
    if(!existsSync(`./data/.${s}-ver`)) {
      await writeFile(`./data/.${s}-ver`, "unknown", "utf8");
    }
  }

  let installedCliVer = await readFile("./data/.cli-ver","utf8");
  let installedPatchesVer = await readFile("./data/.patches-ver", "utf8");
  let installedIntegrationsVer = await readFile("./data/.integrations-ver", "utf8");

  if(!existsSync("./data/cli.jar")) {
    console.log("Missing CLI, downloading...");
    await downloadFile(cliData.assets[0].browser_download_url, "./data/cli.jar");
    await writeFile("./data/.cli-ver", cliVer, {encoding: "utf-8"});
    console.log("OK!\n");
  } else if(cliVer != installedCliVer) {
    console.log(`Latest CLI ${cliVer} does not match ${installedCliVer}, downloading...`);
    await downloadFile(cliData.assets[0].browser_download_url, "./data/cli.jar");
    await writeFile("./data/.cli-ver", cliVer, {encoding: "utf-8"});
    console.log("OK!\n");
  } else {
    console.log("CLI Up to Date:",installedCliVer);
  }

  if(!existsSync("./data/patches.jar") || !existsSync("./data/patches.json")) {
    console.log("Missing Patches, downloading...");
    await downloadFile(patchesData.assets[0].browser_download_url, "./data/patches.json");
    await downloadFile(patchesData.assets[1].browser_download_url, "./data/patches.jar");
    await writeFile("./data/.patches-ver", patchesVer, {encoding: "utf-8"});
    console.log("OK!\n");
  } else if(patchesVer != installedPatchesVer) {
    console.log(`Latest Patches ${patchesVer} does not match ${installedPatchesVer}, downloading...`);
    await downloadFile(patchesData.assets[0].browser_download_url, "./data/patches.json");
    await downloadFile(patchesData.assets[1].browser_download_url, "./data/patches.jar");
    await writeFile("./data/.patches-ver", patchesVer, {encoding: "utf-8"});
    console.log("OK!\n");
  } else {
    console.log("Patches Up to Date:",installedPatchesVer);
  }

  if(!existsSync("./data/integrations.apk")) {
    console.log("Missing Integrations, downloading...");
    await downloadFile(integrationsData.assets[0].browser_download_url, "./data/integrations.apk");
    await writeFile("./data/.integrations-ver", integrationsVer, {encoding: "utf-8"});
    console.log("OK!\n");
  } else if(integrationsVer != installedIntegrationsVer) {
    console.log(`Latest Integrations ${integrationsVer} does not match ${installedIntegrationsVer}, downloading...`);
    await downloadFile(integrationsData.assets[0].browser_download_url, "./data/integrations.apk");
    await writeFile("./data/.integrations-ver", integrationsVer, {encoding: "utf-8"});
    console.log("OK!\n");
  } else {
    console.log("Integrations Up to Date:",installedIntegrationsVer);
  }

  if(!readdirSync("./data/apks").length) {
    console.log(red(bold("No APKs. "))+"Add some to "+grey("./data/apks")+" and try again")
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
    console.log(red(bold("No compatible patches"))+" for "+grey(manifest.package+" v"+manifest.versionName));
    process.exit(1);
  }

  let baseOpts = await prompts([
    {
      type: "confirm",
      name: "useIntegrations",
      message: "Use Integrations",
      initial: true
    },
    {
      type: "confirm",
      name: "useAdb",
      message: "Use ADB"
    }
  ]);

  let adbOpts;
  if(baseOpts.useAdb) {
    adbOpts = await prompts([
      {
        type: "confirm",
        name: "rootMode",
        message: "Root Mode (mount)"
      },
      {
        type: "text",
        name: "deviceId",
        message: "Device ID"
      }
    ]);
    if(!adbOpts.rootMode) console.log(bold(red("Heads Up! "))+"You might need to uninstall the app first for automatic installation to work.")
    else if(manifest.package == "com.google.android.youtube")
      console.log(bold(red("Heads Up! "))+"Since you've enabled root mode, the "+grey("microg-support")+" patch is automatically excluded.")
    else if(manifest.package == "com.google.android.apps.youtube.music")
      console.log(bold(red("Heads Up! "))+"Since you've enabled root mode, the "+grey("music-microg-support")+" patch is automatically excluded.")
  }

  let excludePatches = compatiblePatches.filter(v => !v.excluded).map(v => [{title: v.name, description: v.description}][0]);
  let includePatches = compatiblePatches.filter(v => v.excluded).map(v => [{title: v.name, description: v.description}][0])

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

  if(baseOpts.useIntegrations) args.push("-m","integrations.apk");
  if(baseOpts.useAdb) args.push("-d",adbOpts?.deviceId);
  if(adbOpts?.rootMode) args.push("--mount");
  if(adbOpts?.rootMode && manifest.package == "com.google.android.youtube") args.push("-e","microg-support");
  else if(adbOpts?.rootMode && manifest.package == "com.google.android.apps.youtube.music") args.push("-e", "music-microg-support");

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

let fin = promisify(finished);

async function downloadFile(url: string, filename: string) {
  let stream = createWriteStream(filename);
  let file = await axios.get(url, {responseType: "stream"});
  file.data.pipe(stream);
  return fin(stream);
}

function handleFetchErr(reason: any) {
  console.log(red(bold("Oops! "))+"Something went wrong.")
  console.log(reason);
  process.exit(1);
}