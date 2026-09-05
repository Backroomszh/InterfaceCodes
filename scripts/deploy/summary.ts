import { execFileSync } from 'node:child_process';

interface GitInfo {
    subject: string;
    author: string;
    coAuthors: Array<string>;
}

const getGitInfo = (sourcePaths: Array<string>): GitInfo => {
    if (sourcePaths.length === 0) {
        throw new Error('No source paths were provided for Git metadata');
    }

    let output: string;
    try {
        output = execFileSync(
            'git',
            [
                'log',
                '-1',
                '--format=%s%x00%aN%x00%(trailers:key=Co-authored-by,valueonly)',
                '--',
                ...sourcePaths,
            ],
            { encoding: 'utf8' },
        );
    } catch (error) {
        throw new Error(`Failed to read Git metadata for ${sourcePaths.join(', ')}`, {
            cause: error,
        });
    }

    const [subject, author, ...trailerParts] = output.trimEnd().split('\0');
    if (!subject || !author) {
        throw new Error(`No Git commit found for ${sourcePaths.join(', ')}`);
    }

    const coAuthors = trailerParts
        .join('\0')
        .split('\n')
        .map(line => line.replace(/\s*<.+>$/, '').trim())
        .filter(Boolean);

    return { subject, author, coAuthors };
};

const truncateMessage = (message: string): string => {
    const firstLine = message.split('\n')[0] ?? '';
    return firstLine.length > 100 ? `${firstLine.slice(0, 100)}...` : firstLine;
};

const formatSummary = ({ subject, author, coAuthors }: GitInfo): string => {
    const coAuthorPart = coAuthors.length
        ? `, Co-authored-by: ${coAuthors.join(', ')}`
        : '';
    return `Git commit: ${truncateMessage(subject)}, authored by ${author}${coAuthorPart}`;
};

export { formatSummary, getGitInfo };
export type { GitInfo };
