import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, relative, resolve, sep } from 'node:path';
import sha256 from 'crypto-js/sha256';
import FastGlob from 'fast-glob';
import type { contentHashObj } from '@/types/deploy';

interface DeployEntry {
    content: string;
    sourcePaths: Array<string>;
}

const sourcePathFor = (file: string): Array<string> => {
    const rel = relative(resolve('dist'), resolve(file)).replaceAll(sep, '/');

    if (rel === 'gadgets/Gadgets-definition') {
        return [
            'src/gadgets/Gadgets-definition-list.yaml',
            ...FastGlob.sync('src/gadgets/*/definition.yaml').map(path =>
                path.replaceAll(sep, '/'),
            ),        ];
    }

    const sourceRel = rel;
    if (sourceRel.endsWith('.js')) {
        const tsPath = `src/${sourceRel.slice(0, -3)}.ts`;
        if (existsSync(resolve(tsPath))) {
            return [tsPath];
        }
    }

    return [`src/${sourceRel}`];
};

const contentHash = async (): Promise<contentHashObj> => {
    const paths = await FastGlob.async('dist/**', { onlyFiles: true });

    const entries = await Promise.all(
        paths.map(async file => {
            const content = (await readFile(file, 'utf-8')).trim(),
                fullName = `MediaWiki:${basename(file)}`,
                hash = sha256(content).toString();
            return {
                [fullName]: {
                    content,
                    hash,
                    sourcePaths: sourcePathFor(file),
                },
            } as const;
        }),
    );

    return Object.assign({}, ...entries);
};

type DeployDiff = Record<string, DeployEntry>;

const needDeploy = (
    oldHash: Record<string, string> | Record<string, never>,
    newHash: contentHashObj,
): DeployDiff => {
    if (Object.keys(oldHash).length === 0) {
        return Object.fromEntries(
            Object.entries(newHash).map(([key, { content, sourcePaths }]) => [
                key,
                { content, sourcePaths },
            ]),
        );
    }

    return Object.keys(newHash).reduce<DeployDiff>((acc, key) => {
        const entry = newHash[key];
        if (entry && (!(key in oldHash) || oldHash[key] !== entry.hash)) {
            acc[key] = { content: entry.content, sourcePaths: entry.sourcePaths };
        }
        return acc;
    }, {});
};

export { contentHash, needDeploy };
