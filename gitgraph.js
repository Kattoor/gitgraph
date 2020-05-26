const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs');

const repoUrl = process.argv[2];
const simplifyByDecoration = true;

const repoName = repoUrl.split('/')
    .slice(-1)[0] // get last element in array
    .slice(0, -4); // remove .git

getRepo()
    .then(dumpGitData)
    .then(parseDumpToDotFormat);

async function getRepo() {
    const alreadyCloned = fs.existsSync(`./${repoName}`);

    const gitAction = alreadyCloned ? 'Pulling' : 'Cloning';

    console.log(`${gitAction} git repo at ${repoUrl}`);

    const {stdout} = await (
        alreadyCloned
            ? exec('cd lccl && git pull origin master')
            : exec('git clone ' + repoUrl));

    console.log(`${gitAction} finished`);

    return stdout;
}

async function dumpGitData() {
    console.log('Dumping git data');

    const gitLogParams = [
        '--all',
        simplifyByDecoration ? '--simplify-by-decoration' : '',
        '--pretty=format:"%h|%p|%d"'
    ].filter(Boolean).join(' ');

    const {stdout} = await exec(`cd ${repoName} && git log ${gitLogParams}`);

    console.log('Successfully dumped');
    return stdout;
}

function parseDumpToDotFormat(gitDump) {
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
    const alreadyMarkedUp = [];

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
}
