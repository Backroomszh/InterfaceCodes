import { Mwn } from 'mwn';
import 'dotenv/config';
import { formatSummary, getGitInfo } from './summary';
import { contentHash, needDeploy } from './utils';

const deploy = async () => {
    const bot = await Mwn.init({
        apiUrl: 'https://mirror.backroomszh.org/w/api.php',
        userAgent: `${process.env['USERAGENT']} (Github Actions; Saoutax-bot)`,
        username: 'MisakaNetwork@MisakaNetwork',
        password: process.env['PASSWORD']!,
        maxRetries: 20,
    });

    const oldDeploymentJson = async (): Promise<Record<string, string> | Record<string, never>> => {
        const data = await bot.read('MediaWiki:Deployment.json', {
            rvprop: ['content'],
        });
        const content = 'missing' in data ? '' : (data.revisions?.[0]?.content ?? '');
        return content ? JSON.parse(content) : {};
    };

    const oldDeploy = await oldDeploymentJson();
    const currentDeploy = await contentHash();
    const currentHashes = Object.fromEntries(
        Object.entries(currentDeploy).map(([key, { hash }]) => [key, hash]),
    );
    const hashesChanged =
        Object.keys(oldDeploy).length !== Object.keys(currentHashes).length ||
        Object.entries(currentHashes).some(([key, hash]) => oldDeploy[key] !== hash);

    if (!hashesChanged) {
        console.log('No changes detected, skipping deploy.');
        return;
    }

    const deployment = needDeploy(oldDeploy, currentDeploy);

    await bot.batchOperation(Object.entries(deployment), async ([title, entry]) => {
        const summary = formatSummary(getGitInfo(entry.sourcePaths));
        await bot.save(title, entry.content, summary, { bot: true, tags: 'Bot' });
    });

    const deploymentSourcePaths = Object.values(deployment).flatMap(({ sourcePaths }) => sourcePaths);
    const deploymentSummary = deploymentSourcePaths.length
        ? formatSummary(getGitInfo([...new Set(deploymentSourcePaths)]))
        : 'Git deployment metadata update';
    await bot.save(
        'MediaWiki:Deployment.json',
        JSON.stringify(currentHashes),
        deploymentSummary,
        {
            bot: true,
            tags: 'Bot',
        },
    );
};

export { deploy };
