import { readFile } from 'node:fs/promises';
import { parse } from 'node:path';
import sha256 from 'crypto-js/sha256';
import FastGlob from 'fast-glob';
import type { contentHashObj } from '@/types/deploy';

const contentHash = async (): Promise<contentHashObj> => {
    const paths = await FastGlob.async('dist/**', { onlyFiles: true });

    const entries = await Promise.all(
        paths.map(async file => {
            const content = (await readFile(file, 'utf-8')).trim(),
                { base } = parse(file),
                prefix = 'MediaWiki:',
                fullName = prefix + base,
                hash = sha256(content).toString();
            return {
                [fullName]: {
                    content,
                    hash,
                },
            } as const;
        }),
    );

    return Object.assign({}, ...entries);
};

const needDeploy = (
    oldHash: Record<string, string> | Record<string, never>,
    newHash: contentHashObj,
) => {
    if (Object.keys(oldHash).length === 0) {
        return Object.fromEntries(
            Object.entries(newHash).map(([key, { content }]) => [key, content]),
        );
    } else {
        return Object.keys(newHash).reduce(
            (acc, key) => {
                if (!(key in oldHash) || oldHash[key] !== newHash[key]?.hash) {
                    acc[key] = newHash[key]?.content || '';
                }
                return acc;
            },
            {} as Record<string, string>,
        );
    }
};

export { contentHash, needDeploy };
