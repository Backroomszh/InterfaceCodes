type contentHashObj = Record<
    string,
    {
        content: string;
        hash: string;
        sourcePaths: Array<string>;
    }
>;

export { contentHashObj };
