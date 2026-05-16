interface GadgetConfig {
    ResourceLoader: boolean;
    hidden: boolean;
    default: boolean;
    type: 'styles' | 'general';
    rights: Array<string>;
    dependencies: Array<string>;
}

interface GadgetOption {
    enable: boolean;
    files: Array<string>;
}

interface GadgetSetting {
    name: string;
    config: GadgetConfig;
    option: GadgetOption;
}

type GadgetList = Array<{
    section: string;
    gadgets: Array<string>;
}>;

export { GadgetConfig, GadgetList, GadgetOption, GadgetSetting };
