import {exec, OutputMode} from "https://deno.land/x/exec/mod.ts";
import {exists} from "https://deno.land/std/fs/mod.ts";
import args from "https://deno.land/x/args/wrapper.ts";
import {Option, PartialOption, BinaryFlag} from "https://deno.land/x/args/flag-types.ts";
import {Text} from "https://deno.land/x/args/value-types.ts";
import {PARSE_FAILURE} from "https://deno.land/x/args/symbols.ts";

enum GitAction {
    Clone,
    Pull
}

const parser = args
    .with(PartialOption("output", {type: Text, default: null}))
    .with(Option("gitUrl", {type: Text, alias: ['git-url']}))
    .with(PartialOption("repoDir", {type: Text, default: null, alias: ['repo-dir']}))
    .with(BinaryFlag("allCommits"));

const res = parser.parse(Deno.args);
if (res.tag === PARSE_FAILURE) {
    console.log(res.error.toString());
    Deno.exit(1);
} else {
    const {output, gitUrl, allCommits} = res.value;
    let {repoDir} = res.value;

    const gitAction = repoDir ? GitAction.Pull : GitAction.Clone;

    if (!repoDir)
        repoDir = gitUrl.split('/')
            .slice(-1)[0] // get last element in array
            .slice(0, -4); // remove .git

    repoDir = await getRepo(gitAction, gitUrl, repoDir);

    const dumpedGitData = await dumpGitData(repoDir, allCommits);
    const dotGitGraph = await parseDumpToDotFormat(dumpedGitData);

    if (output) {
        console.log(`Writing output to ${output}`);
        const data = new TextEncoder().encode(dotGitGraph);
        await Deno.writeFile(output, data);
        console.log('Successfully written');
    }
}

async function getRepo(gitAction: GitAction, gitUrl: string, repoDir: string): Promise<string> {

    const alreadyCloned = await exists(`./${repoDir}`);

    switch (gitAction) {
        case GitAction.Clone:
            console.log(`Cloning git repo at ${gitUrl}`);

            if (alreadyCloned) {
                console.log('Already cloned.');
                return getRepo(GitAction.Pull, gitUrl, repoDir);
            }

            await exec('git clone ' + gitUrl)

            console.log('Cloning finished');

            return repoDir;
        case GitAction.Pull:
            console.log(`Pulling git repo at ${gitUrl}`);

            if (!alreadyCloned) {
                console.log(`The repository was not found at directory ${repoDir}. Rerun without the --repo-dir parameter to clone the repository in the current directory.`);
                Deno.exit(1);
            }

            await exec(`cmd /c cd ${repoDir} && git pull origin master`);
            console.log('Pulling finished');
            return repoDir;
    }
}

async function dumpGitData(repoDir: string, allCommits: boolean) {
    console.log('Dumping git data');

    const gitLogParams = [
        '--all',
        allCommits ? '' : '--simplify-by-decoration',
        '--pretty=format:%h^|%p^|%d'
    ].filter(Boolean).join(' ');

    const {output} = await exec(`cmd /c cd ${repoDir} && git log ${gitLogParams}`, {
        output: OutputMode.Capture
    });

    console.log('Successfully dumped');
    return output;
}

function parseDumpToDotFormat(gitDump: string) {
    console.log('Parsing dump to dot format');

    const decoratedCommitRecords = gitDump
        .split('\n')
        .map(line => {
            const records = line.split('|');
            const hash = records[0];
            const parentHashes = records[1].split(' ');
            const refNames = records[2].slice(1);

            return {hash, parentHashes, refNames};
        });

    let dotString = 'digraph G{\n';
    const alreadyMarkedUp: string[] = [];

    decoratedCommitRecords.forEach(({hash, parentHashes, refNames}) => {
        if (!alreadyMarkedUp.includes(hash) && hash !== '') {
            alreadyMarkedUp.push(hash);
            const label = refNames.slice(1, refNames.length - 1).split(',').join('\\n') || hash;
            dotString += `\t"${hash}" [label="${label}" shape="polygon"]\n`;
        }

        parentHashes.forEach(parentHash => {
            if (parentHash !== '')
                dotString += `\t"${hash}" -> "${parentHash}"\n`;
        });
    });

    dotString += '}';

    console.log('Done!');
    console.log('==== GitGraph ====');

    console.log(dotString);

    return dotString;
}
