import process from 'node:process';
import minimist from 'minimist';
import { build } from './build';
import { deploy } from './deploy';

const run = async () => {
    try {
        const { mode } = minimist(process.argv.slice(2), {
            string: ['mode'],
        });

        switch (mode) {
            case 'build':
                await build();
                break;
            case 'deploy': {
                await deploy();
                break;
            }
            default:
                console.error('未提供有效运行参数。');
                process.exit();
        }
        process.exit();
    } catch (error) {
        console.error(`运行时发生错误： ${error}`);
    }
};

await run();
