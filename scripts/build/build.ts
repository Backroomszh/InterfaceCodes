import { rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, relative, dirname, basename } from 'node:path';
import { transformFile } from '@swc/core';
import FastGlob from 'fast-glob';
import { transform } from 'lightningcss';
import { generateDefinition } from './definition';

const SRC_DIR = resolve('src');
const DIST_DIR = resolve('dist');
const banner = `/**
 * -------------------------------------------------------------------------
 * !!! DON'T MODIFY THIS PAGE MANUALLY, YOUR CHANGES WILL BE OVERWRITTEN !!!
 * !!!   Repository URL: https://github.com/Backroomszh/InterfaceCodes   !!!
 * -------------------------------------------------------------------------
 */`;

type FileProcessor = (file: string) => Promise<Uint8Array | string>;

const transpileJs: FileProcessor = async file => {
    const { code } = await transformFile(file);
    return code;
};

const transpileTs: FileProcessor = async file => {
    const { code } = await transformFile(file);
    return code;
};

const transpileCss: FileProcessor = async file => {
    const source = await readFile(file);
    const { code } = transform({
        filename: file,
        code: Buffer.from(source),
        minify: true,
        sourceMap: false,
    });
    return code;
};

const wrapCode = (code: Uint8Array | string): Uint8Array => {
    const encoder = new TextEncoder();

    const prefix = encoder.encode(`${banner}\n\n/* <nowiki> */\n\n`),
        suffix = encoder.encode('\n\n/* </nowiki> */');

    const body = typeof code === 'string' ? encoder.encode(code) : code;

    return new Uint8Array([...prefix, ...body, ...suffix]);
};

const processFiles = async (
    pattern: string,
    subDir: string,
    processor: FileProcessor,
    filter?: (file: string) => boolean,
    outExt?: string,
) => {
    const files = await FastGlob(pattern, { cwd: SRC_DIR, absolute: true });

    await Promise.all(
        files
            .filter(file => !filter || filter(file))
            .map(async file => {
                const relPath = relative(resolve(SRC_DIR, subDir), file);
                let outFile = resolve(DIST_DIR, subDir, relPath);
                if (outExt) {
                    outFile = outFile.replace(/\.[^.]+$/, outExt);
                }
                const code = wrapCode(await processor(file));
                await mkdir(dirname(outFile), { recursive: true });
                await writeFile(outFile, code);
            }),
    );
};

const isGadgetEntryFile = (file: string) => {
    const name = basename(file);
    return /^Gadget-.*\.(js|ts|css)$/.test(name);
};

const build = async () => {
    await rm(DIST_DIR, { recursive: true, force: true });
    await mkdir(resolve(DIST_DIR, 'gadgets'), { recursive: true });

    await writeFile(`${DIST_DIR}/gadgets/Gadgets-definition`, await generateDefinition());

    await Promise.all([
        processFiles('gadgets/*/*.js', 'gadgets', transpileJs, isGadgetEntryFile),
        processFiles('gadgets/*/*.ts', 'gadgets', transpileTs, isGadgetEntryFile, '.js'),
        processFiles('gadgets/*/*.css', 'gadgets', transpileCss, isGadgetEntryFile),
        processFiles('global/*.js', 'global', transpileJs),
        processFiles('global/*.ts', 'global', transpileTs, undefined, '.js'),
        processFiles('global/*.css', 'global', transpileCss),
    ]);
};

export { build };
