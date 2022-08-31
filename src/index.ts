// fair warning to anyone attempting to read (or worse, use)
// this, it is a mess. I wrote it in the middle of the night
// with next to no sleep and should not be considered a
// reliable tool in the slightest. But it does what I need
// so it's good enough for me.

import axios from "axios";
import {createWriteStream, existsSync, mkdirSync, readdirSync} from "fs";
import {readFile, writeFile} from "fs/promises";
import prompts =  require("prompts");
import {red, grey, bold} from "chalk";
import {spawn} from "child_process";
import { promisify } from "util";
import { finished } from "stream";

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
    await updateCli(cliData.assets[0].browser_download_url, cliVer);
    console.log("OK!\n");
  } else if(cliVer != installedCliVer) {
    console.log(`Latest CLI ${cliVer} does not match ${installedCliVer}, downloading...`);
    await updateCli(cliData.assets[0].browser_download_url, cliVer);
    console.log("OK!\n");
  } else {
    console.log("CLI Up to Date:",installedCliVer);
  }

  if(!existsSync("./data/patches.jar")) {
    console.log("Missing Patches, downloading...");
    await updatePatches(patchesData.assets[0].browser_download_url, patchesVer);
    console.log("OK!\n");
  } else if(patchesVer != installedPatchesVer) {
    console.log(`Latest Patches ${patchesVer} does not match ${installedPatchesVer}, downloading...`);
    await updatePatches(patchesData.assets[0].browser_download_url, patchesVer);
    console.log("OK!\n");
  } else {
    console.log("Patches Up to Date:",installedPatchesVer);
  }

  if(!existsSync("./data/integrations.apk")) {
    console.log("Missing Integrations, downloading...");
    await updateIntegrations(integrationsData.assets[0].browser_download_url, integrationsVer);
    console.log("OK!\n");
  } else if(integrationsVer != installedIntegrationsVer) {
    console.log(`Latest Integrations ${integrationsVer} does not match ${installedIntegrationsVer}, downloading...`);
    await updateIntegrations(integrationsData.assets[0].browser_download_url, integrationsVer);
    console.log("OK!\n");
  } else {
    console.log("Integrations Up to Date:",installedIntegrationsVer);
  }

  if(!readdirSync("./data/apks").length) {
    console.log(red(bold("No APKs. "))+"Add some to "+grey("./data/apks")+" and try again")
    process.exit(1);
  }

  let baseOpts = await prompts([
    {
      type: "select",
      name: "apkPath",
      message: "Select APK",
      choices: readdirSync("./data/apks", {withFileTypes: true}).filter(e => e.isFile).map(e => {return {title: e.name, value: e.name}})
    },
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
  }

  let patchOpts = await prompts([
    {
      type: "text",
      name: "exclude",
      message: "Exclude Patches"
    },
    {
      type: "text",
      name: "include",
      message: "Include Patches"
    }
  ]);

  // console.log(baseOpts);
  // console.log(adbOpts);
  // console.log(patchOpts);

  let args = [
    "-jar","cli.jar",
    "-a",`apks/${baseOpts.apkPath}`,
    "-b","patches.jar",
    "-o",`patched/${baseOpts.apkPath}`
  ];

  if(baseOpts.useIntegrations) args.push("-m","integrations.apk");
  if(baseOpts.useAdb) args.push("-d",adbOpts?.deviceId);
  if(adbOpts?.rootMode) args.push("--mount");

  // overkill simplification thanks to Palm#0683 on Discord
  const patchOptsExists = (key: `${'in' | 'ex'}clude`) => !!patchOpts[key].trim().length
  const addPatchArgs = (flag: string, patches: string) => patches.trim().split(" ").forEach((p: string) => args.push(flag, p));

  if(patchOptsExists("exclude")) addPatchArgs("-e", patchOpts.exclude);
  if(patchOptsExists("include")) addPatchArgs("-i", patchOpts.include);

  console.log(args);

  let javaProcess = spawn("java", args, {
    cwd: "./data"
  });

  javaProcess.stdout.on("data", (data) => {
    console.log(data.toString().trimEnd());
  });

  javaProcess.stderr.on("data", (data) => {
    console.log(data.toString().trimEnd());
  });

  javaProcess.on("close", (code) => {
    console.log("Java closed with code "+code);
  })
}

let fin = promisify(finished);

async function updateCli(path: string, version: string) {
  let stream = createWriteStream("./data/cli.jar");
  let cli = await axios.get(path, {responseType: "stream"});
  cli.data.pipe(stream);
  await writeFile("./data/.cli-ver", version, "utf8");
  return fin(stream);
}

async function updatePatches(path: string, version: string) {
  let stream = createWriteStream("./data/patches.jar");
  let patches = await axios.get(path, {responseType: "stream"});
  patches.data.pipe(stream);
  await writeFile("./data/.patches-ver", version, "utf8");
  return fin(stream);
}

async function updateIntegrations(path: string, version: string) {
  let stream = createWriteStream("./data/integrations.apk");
  let integrations = await axios.get(path, {responseType: "stream"});
  integrations.data.pipe(stream);
  await writeFile("./data/.integrations-ver", version, "utf8");
  return fin(stream);
}

function handleFetchErr(reason: any) {
  console.log(red(bold("Oops! "))+"Something went wrong.")
  console.log(reason);
  process.exit(1);
}