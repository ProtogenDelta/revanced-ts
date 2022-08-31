import {readFile} from "fs/promises";
import {Manifest} from "node-apk";
import {grey} from "chalk";

type PatchMetadata = {
	name: string;
	description: string;
	version: string;
	excluded: boolean;
	dependencies: string[];
	compatiblePackages: PackageCompatData[];
}
type PackageCompatData = {
	name: string;
	versions: string[];
}

export async function getCompatiblePatches(manifest: Manifest) {
	process.stdout.write(grey("Checking patches..."));
	let patches = JSON.parse((await readFile("./data/patches.json")).toString()) as Array<PatchMetadata>;
	let compatiblePatches: PatchMetadata[] = [];
	patches.forEach((patch) => {
		if(patch.compatiblePackages.filter((v) =>
			v.name == manifest.package
			&& (!v.versions.length || v.versions.includes(manifest.versionName))
		).length != 0) {
			compatiblePatches.push(patch);
		}
	});
	process.stdout.write(grey(" OK\n"));
	return compatiblePatches;
}