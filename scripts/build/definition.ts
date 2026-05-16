import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { load } from 'js-yaml';
import type { GadgetConfig, GadgetOption, GadgetList, GadgetSetting } from '@/types/gadgets';

/**
 * Loads gadget definitions from YAML files
 *
 * @returns definitions
 */
const getDefinitions = async () => {
    const basePath = resolve('src/gadgets'),
        entries = await readdir(basePath, { withFileTypes: true });

    const result = await Promise.all(
        entries
            .filter(e => e.isDirectory())
            .map(async dir => {
                const { name } = dir,
                    dirPath = join(basePath, name);

                try {
                    const [yamlContent] = await Promise.all([
                        readFile(join(dirPath, 'definition.yaml'), 'utf8'),
                        readdir(dirPath),
                    ]);

                    const content = load(yamlContent) as GadgetConfig & GadgetOption,
                        { enable, files, ...config } = content;

                    return {
                        name,
                        config,
                        option: {
                            enable,
                            files,
                        },
                    };
                } catch (err) {
                    throw new Error(
                        `[Gadget:${name}] Failed to load definition: ${(err as Error).message}`,
                        { cause: err },
                    );
                }
            }),
    );

    return result.filter(Boolean) as Array<GadgetSetting>;
};

/**
 * Parse gadget definition configs and generate its text
 *
 * @param definitionSettings - Array of gadget settings containing configuration and options
 * @returns A promise that resolves to a record mapping gadget names to their definition strings
 */
const parseDefinitions = (definitions: Array<GadgetSetting>) => {
    const result: Record<string, string> = {};

    for (const { name, config, option } of definitions) {
        if (!option.enable) {
            continue;
        }

        const parts = Object.entries(config).flatMap(([key, value]) => {
            if (value === true) {
                return [key];
            }

            if (Array.isArray(value) && value.length) {
                return [`${key}=${value.join(',')}`];
            }

            if (typeof value === 'string') {
                return [`${key}=${value}`];
            }

            return [];
        });

        const files = option.files.map(file => file.replace(/^Gadget-/, '')).join('|');

        result[name] = `* ${name}[${parts.join('|')}]|${files}`;
    }

    return result;
};

/**
 * Generate MediaWiki:Gadgets-definition content based on Gadgets-definition-list.yaml
 *
 * @returns MediaWiki:Gadgets-definition content
 */
const generateDefinition = async () => {
    const definitions = await getDefinitions();
    const parsed = parseDefinitions(definitions);

    const listPath = resolve('src/gadgets/Gadgets-definition-list.yaml');
    const list = load(await readFile(listPath, 'utf8')) as GadgetList;

    let result = '';
    for (const section of list) {
        result += `== ${section.section} ==\n`;

        for (const name of section.gadgets) {
            if (parsed[name]) {
                result += parsed[name] + '\n';
            }
        }

        result += '\n';
    }

    return result;
};

export { generateDefinition };
