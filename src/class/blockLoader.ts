type LoadBlockParam = {
    categoryName: string;
    blockName: string;
    block: any;
    isBlockShow?: boolean;
};

// expansion blocks 의 스키마를 따름
type EntryBlockModule = {
    name: string;
    title: { [key: string]: string };
    description: string;
    getBlocks: () => { [blockName: string]: any };
};

class BlockLoader {
    private _moduleList: string[] = [];

    get moduleList() {
        return this._moduleList;
    }
    /**
     * 해당 url 을 동적으로 로드한다.
     * 해당 함수는 굉장히 위험하므로 추가적인 방어로직이 필요하다.
     */
    // bl.loadModule(moduleName: string) bl.loadBlock(blockName, block)...
    loadModule(moduleName: string): Promise<void> {
        // 이미 로드된 모듈은 다시 로드하지 않는다.
        if (this._moduleList.includes(moduleName)) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const scriptElementId = `entryModuleScript${Date.now()}`;

            if (!moduleName) {
                return;
            }
            const scriptElement = document.createElement('script');
            scriptElement.id = scriptElementId;

            scriptElement.onload = () => {
                this._moduleList.push(moduleName);
                scriptElement.remove();
                resolve();
            };
            scriptElement.onerror = (e) => {
                scriptElement.remove();
                reject(e);
            };

            scriptElement.src = `${Entry.moduleBaseUrl}${moduleName}/files/block`;

            // noinspection JSCheckFunctionSignatures
            document.body.appendChild(scriptElement);
        });
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * [!] 외부에서 사용하는 함수입니다. 모듈화된 블록이 엔트리 등록을 위해 사용하는 함수임
     * 각 블록정보가 존재해야할 위치에 모든 데이터를 뿌려준다. 위치는 아래와 같다
     * - Entry.HARDWARE_LIST
     * - Entry.block : 실제 블록 정보를 담는다.
     *
     * 워크스페이스 리로드시 정보가 저장되지 않는다.
     * 이 후 블록메뉴에 블록들을 실시간으로 추가한 뒤 reDraw 한다.
     * @param moduleObject 하드웨어 모듈. 여타 하드웨어 모듈 파일 참조
     */
    registerHardwareModule(moduleObject: IEntry.HardwareModule) {
        if (!moduleObject.getBlocks || !moduleObject.blockMenuBlocks) {
            return;
        }

        if (typeof moduleObject.id === 'string') {
            Entry.HARDWARE_LIST[moduleObject.id] = moduleObject;
        } else if (moduleObject.id instanceof Array) {
            moduleObject.id.forEach((id) => {
                Entry.HARDWARE_LIST[id] = moduleObject;
            });
        }

        this.setLanguageTemplates(moduleObject);
        const blockObjects = moduleObject.getBlocks();
        const blockMenuBlocks = moduleObject.blockMenuBlocks;

        Object.entries(blockObjects).forEach(([blockName, block]) => {
            this.loadBlock({
                categoryName: 'arduino',
                isBlockShow: blockMenuBlocks.indexOf(blockName) > -1,
                blockName,
                block,
            });
        });
        Entry.hw.setExternalModule(moduleObject);
        Entry.dispatchEvent('hwChanged');
    }

    /**
     * 이 함수는 외부 블록 모듈 URL 의 코드가 호출한다.
     * 엔트리 내 '확장' 카테고리에 블록을 추가한다.
     * 블록은 moduleObject 의 정보에 따라 타이틀, 설명 TextBlock 이 같이 추가된다.
     * @param moduleObject
     */
    registerBlockModule(moduleObject: EntryBlockModule) {
        // 1. 모듈 프로퍼티에 대한 검증. 블록이 없다거나 잘못된 값이 있다거나 등등.
        // 2. 타이틀 블록과 설명 블록을 만든다
        // 3. 타이틀 블록, 설명 블록, getBlocks 로 가져온 블록오브젝트 순으로 loadBlock 한다.
        // 4. 마지막에 reDraw 한다. (현재는 매 block load 당 reDraw)
        // (5. 모듈리스트에 등록한다. 등록이 이루어지는 경우, 엔트리 verified 블록인지 외부 url 로드된 블록인지 판단해야 한다.)
    }

    loadBlock({ categoryName, blockName, block, isBlockShow = false }: LoadBlockParam) {
        const blockMenu = Entry.getMainWS().blockMenu;

        // 블록을 BlockMenu thread 에 포함시키려면 이 값이 필요함 (key 로 사용됨)
        if (!block.type) {
            block.type = blockName;
        }

        // 블록의 카테고리를 정의할때 사용
        if (!block.category) {
            block.category = categoryName;
        }

        Entry.block[blockName] = block;

        if (isBlockShow) {
            blockMenu.addCategoryData(categoryName, blockName);
            blockMenu.reDraw();
        }
    }

    /**
     * TODO 리로드 되는 경우 다시 불러오지 않기 때문에 템플릿정보 저장이 필요함
     */
    private setLanguageTemplates(moduleObject: IEntry.HardwareModule) {
        if (moduleObject.setLanguage) {
            const langTemplate = moduleObject.setLanguage();
            const data = langTemplate[Lang.type] || langTemplate[Lang.fallbackType];
            for (const key in data) {
                Object.assign(Lang[key], data[key]);
            }
        }
    }
}

const instance = new BlockLoader();
export default instance;
Entry.moduleManager = instance;

/**
 * 프로젝트 가 외부 모듈이 사용되었는지 확인하고, 로드한다
 * @param {*} project 엔트리 프로젝트
 * @return Promise
 */
Entry.loadExternalModules = async (project = {}) => {
    const { externalModules = [] } = project;
    await Promise.all(externalModules.map(instance.loadModule));
};
