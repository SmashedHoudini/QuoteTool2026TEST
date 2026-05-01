/*
    Plain JavaScript admin editor for pricing.json.

    The page talks to server.js when it is available. That lets us save changes
    directly to the local pricing.json file while we are working in VSCode.
    Later, the loadPricing/savePricing functions can point to a hosted backend
    without rewriting the form rendering below.
*/
(function () {
    const PLAN_SECTIONS = {
        smartphonePlans: 'Smartphone',
        tabletPlans: 'Tablet',
        watchPlans: 'Watch',
        homeInternetPlans: 'Home Internet'
    };

    const DEVICE_TYPES = ['Smartphone', 'Tablet', 'Watch', 'Home Internet', 'Custom'];
    const EMPTY_PLANS = {
        smartphonePlans: { name: 'New Smartphone Plan', costs: [0, 0, 0, 0], autopay: 0, discountSlots: 0 },
        tabletPlans: { name: 'New Tablet Plan', price: 0 },
        watchPlans: { name: 'New Watch Plan', price: 0 },
        homeInternetPlans: { name: 'New Home Internet Plan', price: 0, mhDiscount: 0, autopay: 0 }
    };
    const EMPTY_PERK = { name: 'New Perk', cost: 0, savings: 0 };
    const EMPTY_DEVICE = { id: '', enabled: true, type: 'Smartphone', manufacturer: '', model: '', storage: '', price: 0 };

    let config = null;
    let activeTab = 'plans';
    let planSection = 'smartphonePlans';
    let deviceTypeFilter = 'All';
    let deviceManufacturerFilter = 'All';
    let pendingDelete = null;
    let draggedItem = null;

    const editor = document.getElementById('editor');
    const statusText = document.getElementById('statusText');

    const clone = (value) => JSON.parse(JSON.stringify(value));
    const money = (value) => Number(value || 0).toFixed(2);
    const numberValue = (value) => {
        const cleaned = String(value).replace(/[^0-9.-]/g, '');
        const parsed = parseFloat(cleaned);
        return Number.isFinite(parsed) ? parsed : 0;
    };
    const setStatus = (message) => {
        statusText.textContent = message;
    };

    const loadPricing = async () => {
        const response = await fetch('/api/pricing', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Unable to load pricing.json (${response.status})`);
        const data = await response.json();
        config = { devices: [], ...data };
        setStatus('Loaded pricing.json');
        render();
    };

    const savePricing = async () => {
        config.devices = sortDevices(config.devices || []);
        const response = await fetch('/api/pricing', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(error || `Unable to save pricing.json (${response.status})`);
        }
        setStatus('Saved pricing.json');
    };

    const markDirty = () => setStatus('Unsaved changes');

    const showDeleteConfirm = (onConfirm) => {
        pendingDelete = onConfirm;
        document.getElementById('confirmDialog').classList.remove('hidden');
    };

    const hideDeleteConfirm = () => {
        pendingDelete = null;
        document.getElementById('confirmDialog').classList.add('hidden');
    };

    const escapeHtml = (value) => String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');

    const slugDevice = (device) => (
        [device.manufacturer, device.model, device.storage]
            .filter(Boolean)
            .join('-')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') || `device-${Date.now()}`
    );

    const storageRank = (storage) => {
        const match = String(storage || '').match(/[\d.]+/);
        if (!match) return Number.MAX_SAFE_INTEGER;
        const value = parseFloat(match[0]);
        return /tb/i.test(storage) ? value * 1024 : value;
    };

    const typeRank = (type) => {
        const index = DEVICE_TYPES.indexOf(type);
        return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };

    const sortDevices = (devices) => [...devices].sort((a, b) => (
        (typeRank(a.type) - typeRank(b.type))
        || String(a.manufacturer || '').localeCompare(String(b.manufacturer || ''))
        || String(a.model || '').localeCompare(String(b.model || ''))
        || (storageRank(a.storage) - storageRank(b.storage))
    ));

    const trashButton = (action, index) => `
        <button type="button" class="trash-button" data-action="${action}" data-index="${index}" aria-label="Remove">
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 6h18"></path>
                <path d="M8 6V4h8v2"></path>
                <path d="M6 6l1 15h10l1-15"></path>
                <path d="M10 11v6"></path>
                <path d="M14 11v6"></path>
            </svg>
        </button>
    `;

    const dragHandle = (type, index) => `
        <button type="button" class="drag-handle" draggable="true" data-drag-type="${type}" data-index="${index}" aria-label="Drag to reorder" title="Drag to reorder">
            <span></span><span></span><span></span>
        </button>
    `;

    const activeCheckbox = (path, checked) => `
        <label class="active-cell">
            <span>Active</span>
            <input type="checkbox" data-field="${path}" data-checkbox="true" ${checked === false ? '' : 'checked'}>
        </label>
    `;

    const textField = (label, path, value, placeholder = '') => `
        <label>
            <span>${label}</span>
            <input data-field="${path}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}">
        </label>
    `;

    const numberField = (label, path, value) => `
        <label>
            <span>${label}</span>
            <input data-field="${path}" data-number="true" inputmode="decimal" value="${Number(value || 0)}">
        </label>
    `;

    const moneyField = (label, path, value) => `
        <label>
            <span>${label}</span>
            <div class="money-field">
                <b>$</b>
                <input data-field="${path}" data-money="true" inputmode="decimal" value="${Number(value || 0) === 0 ? '' : money(value)}" placeholder="0.00">
            </div>
        </label>
    `;

    const selectField = (label, path, value, options) => `
        <label>
            <span>${label}</span>
            <select data-field="${path}">
                ${options.map(option => `<option ${option === value ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}
            </select>
        </label>
    `;

    const setByPath = (path, value) => {
        const parts = path.split('.');
        let target = config;
        parts.slice(0, -1).forEach(part => {
            target = target[part];
        });
        target[parts.at(-1)] = value;
        markDirty();
    };

    const render = () => {
        document.querySelectorAll('.tabs button').forEach(button => {
            button.classList.toggle('active', button.dataset.tab === activeTab);
        });

        if (activeTab === 'plans') renderPlans();
        if (activeTab === 'perks') renderPerks();
        if (activeTab === 'devices') renderDevices();
        if (activeTab === 'other') renderOther();
    };

    const renderPlans = () => {
        const plans = config[planSection] || [];
        editor.innerHTML = `
            <div class="section-header">
                <div>
                    <h2>Plans</h2>
                    <p>Filter by device type and edit plan values inline.</p>
                </div>
                <div class="filters">
                    ${Object.entries(PLAN_SECTIONS).map(([key, label]) => `<button type="button" data-action="plan-section" data-section="${key}" class="${key === planSection ? 'primary' : ''}">${label}</button>`).join('')}
                </div>
            </div>
            <div class="list">
                <div class="list-header plan-header ${planSection === 'smartphonePlans' ? 'smartphone-plan-header' : ''}">
                    <span></span>
                    <span>Plan Name</span>
                    ${planSection === 'smartphonePlans' ? '<span>1 Line</span><span>2 Lines</span><span>3 Lines</span><span>4+ Lines</span><span>Auto Pay</span><span>Slots</span>' : '<span>Price</span>'}
                    ${planSection === 'homeInternetPlans' ? '<span>M+H Disc.</span><span>Auto Pay</span>' : ''}
                    <span></span>
                </div>
                ${plans.map((plan, index) => renderPlanRow(plan, index)).join('')}
            </div>
            <p style="margin-top:14px"><button type="button" data-action="add-plan" class="primary">Add ${PLAN_SECTIONS[planSection]} Plan</button></p>
        `;
    };

    const renderPlanRow = (plan, index) => {
        const base = `
            <div class="list-row reorder-row" data-drop-type="plan" data-index="${index}">
                ${dragHandle('plan', index)}
                ${textField('Plan name', `${planSection}.${index}.name`, plan.name)}
        `;

        if (planSection === 'smartphonePlans') {
            return `${base}
                <div class="inline-fields smartphone-fields">
                    ${(plan.costs || [0, 0, 0, 0]).map((cost, costIndex) => moneyField(`${costIndex + 1} line${costIndex === 0 ? '' : 's'}`, `${planSection}.${index}.costs.${costIndex}`, cost)).join('')}
                    ${moneyField('Auto Pay discount', `${planSection}.${index}.autopay`, plan.autopay)}
                    ${numberField('Discount slots', `${planSection}.${index}.discountSlots`, plan.discountSlots)}
                </div>
                <div class="row-tools">${trashButton('remove-plan', index)}</div>
            </div>`;
        }

        return `${base}
            <div class="inline-fields">
                ${moneyField('Price', `${planSection}.${index}.price`, plan.price)}
                ${planSection === 'homeInternetPlans' ? moneyField('M+H discount', `${planSection}.${index}.mhDiscount`, plan.mhDiscount) : ''}
                ${planSection === 'homeInternetPlans' ? moneyField('Auto Pay discount', `${planSection}.${index}.autopay`, plan.autopay) : ''}
            </div>
            <div class="row-tools">${trashButton('remove-plan', index)}</div>
        </div>`;
    };

    const renderPerks = () => {
        editor.innerHTML = `
            <div class="section-header">
                <div>
                    <h2>Perks</h2>
                    <p>Edit perk order, cost, and savings inline.</p>
                </div>
                <button type="button" data-action="add-perk" class="primary">Add Perk</button>
            </div>
            <div class="list">
                <div class="list-header perk-header">
                    <span></span>
                    <span>Perk Name</span>
                    <span>Cost</span>
                    <span>Savings</span>
                    <span></span>
                </div>
                ${(config.perks || []).map((perk, index) => `
                    <div class="list-row perk-row reorder-row" data-drop-type="perk" data-index="${index}">
                        ${dragHandle('perk', index)}
                        <div class="inline-fields perk-fields">
                            ${textField('Perk name', `perks.${index}.name`, perk.name)}
                            ${moneyField('Cost', `perks.${index}.cost`, perk.cost)}
                            ${moneyField('Savings', `perks.${index}.savings`, perk.savings)}
                        </div>
                        <div class="row-tools">${trashButton('remove-perk', index)}</div>
                    </div>
                `).join('')}
            </div>
        `;
    };

    const renderDevices = () => {
        const devices = config.devices || [];
        const manufacturers = ['All', ...Array.from(new Set(devices.map(device => device.manufacturer).filter(Boolean))).sort()];
        const visibleDevices = sortDevices(devices).filter(device => (
            (deviceTypeFilter === 'All' || device.type === deviceTypeFilter)
            && (deviceManufacturerFilter === 'All' || device.manufacturer === deviceManufacturerFilter)
        ));

        editor.innerHTML = `
            <div class="section-header">
                <div>
                    <h2>Devices</h2>
                    <p>Maintain future device presets by type, manufacturer, model, storage, and retail price.</p>
                </div>
                <div class="filters">
                    <label class="filter-field"><span>Device Type</span><select data-action="device-type-filter">
                        ${['All', ...DEVICE_TYPES].map(type => `<option ${type === deviceTypeFilter ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('')}
                    </select></label>
                    <label class="filter-field"><span>Manufacturer</span><select data-action="device-manufacturer-filter">
                        ${manufacturers.map(manufacturer => `<option ${manufacturer === deviceManufacturerFilter ? 'selected' : ''}>${escapeHtml(manufacturer)}</option>`).join('')}
                    </select></label>
                    <button type="button" data-action="clear-device-filters">Clear filters</button>
                    <button type="button" data-action="add-device" class="primary">Add Device</button>
                </div>
            </div>
            <div class="list">
                <div class="list-header device-header">
                    <span>Active</span>
                    <span>Device Type</span>
                    <span>Manufacturer</span>
                    <span>Model</span>
                    <span>Storage</span>
                    <span>Retail Price</span>
                    <span></span>
                </div>
                ${visibleDevices.map(device => renderDeviceRow(device, devices.indexOf(device))).join('')}
            </div>
        `;
    };

    const renderDeviceRow = (device, index) => `
        <div class="list-row device-row ${device.enabled === false ? 'disabled-row' : ''}">
            ${activeCheckbox(`devices.${index}.enabled`, device.enabled)}
            <div class="inline-fields device-fields">
                ${selectField('Device type', `devices.${index}.type`, device.type || 'Smartphone', DEVICE_TYPES)}
                ${textField('Manufacturer', `devices.${index}.manufacturer`, device.manufacturer, 'Apple')}
                ${textField('Model', `devices.${index}.model`, device.model, 'iPhone 17 Pro Max')}
                ${textField('Storage', `devices.${index}.storage`, device.storage, '256GB')}
                ${moneyField('Retail price', `devices.${index}.price`, device.price)}
            </div>
            <div class="row-tools single">${trashButton('remove-device', index)}</div>
        </div>
    `;

    const renderOther = () => {
        const settings = config.quoteSettings;
        const taxes = settings['taxes&surcharges'];
        editor.innerHTML = `
            <div class="settings-grid">
                <div class="settings-panel">
                    <h3>Quote Settings</h3>
                    <div class="form-grid">
                        ${numberField('Financing months', 'quoteSettings.financingMonths', settings.financingMonths)}
                        ${numberField('Connected discount rate', 'quoteSettings.connectedDeviceDiscountRate', settings.connectedDeviceDiscountRate)}
                    </div>
                </div>
                <div class="settings-panel">
                    <h3>Taxes & Surcharges</h3>
                    <div class="form-grid">
                        ${Object.entries(taxes).map(([key, value]) => moneyField(key, `quoteSettings.taxes&surcharges.${key}`, value)).join('')}
                    </div>
                </div>
                <div class="settings-panel">
                    <h3>Individual Protection</h3>
                    <div class="form-grid">
                        ${Object.entries(settings.individualProtection).map(([key, value]) => moneyField(key, `quoteSettings.individualProtection.${key}`, value)).join('')}
                    </div>
                </div>
                <div class="settings-panel">
                    <h3>Multi-Device Protection</h3>
                    <div class="form-grid">
                        ${moneyField('Per-line cost', 'quoteSettings.multiDeviceProtection.perLine', settings.multiDeviceProtection.perLine)}
                        ${moneyField('Monthly cap', 'quoteSettings.multiDeviceProtection.monthlyCap', settings.multiDeviceProtection.monthlyCap)}
                    </div>
                </div>
            </div>
        `;
    };

    editor.addEventListener('change', (event) => {
        const field = event.target.closest('[data-field]');
        if (field) {
            const value = field.dataset.checkbox === 'true'
                ? field.checked
                : field.dataset.money === 'true' || field.dataset.number === 'true'
                ? numberValue(field.value)
                : field.value;
            setByPath(field.dataset.field, value);
            if (field.dataset.field.startsWith('devices.')) {
                const index = parseInt(field.dataset.field.split('.')[1], 10);
                config.devices[index].id = slugDevice(config.devices[index]);
            }
            if (field.dataset.money === 'true') field.value = Number(setValueForPath(field.dataset.field) || 0) === 0 ? '' : money(setValueForPath(field.dataset.field));
            return;
        }

        if (event.target.dataset.action === 'device-type-filter') {
            deviceTypeFilter = event.target.value;
            render();
        }

        if (event.target.dataset.action === 'device-manufacturer-filter') {
            deviceManufacturerFilter = event.target.value;
            render();
        }
    });

    editor.addEventListener('click', (event) => {
        const actionTarget = event.target.closest('[data-action]');
        if (!actionTarget) return;
        const action = actionTarget.dataset.action;
        const index = parseInt(actionTarget.dataset.index, 10);

        if (action === 'plan-section') {
            planSection = actionTarget.dataset.section;
            render();
        }
        if (action === 'add-plan') {
            config[planSection].push(clone(EMPTY_PLANS[planSection]));
            markDirty();
            render();
        }
        if (action === 'remove-plan') {
            showDeleteConfirm(() => {
                config[planSection].splice(index, 1);
                markDirty();
                render();
            });
        }
        if (action === 'add-perk') {
            config.perks.push(clone(EMPTY_PERK));
            markDirty();
            render();
        }
        if (action === 'remove-perk') {
            showDeleteConfirm(() => {
                config.perks.splice(index, 1);
                markDirty();
                render();
            });
        }
        if (action === 'add-device') {
            config.devices = config.devices || [];
            config.devices.push({ ...clone(EMPTY_DEVICE), id: `device-${Date.now()}` });
            markDirty();
            render();
        }
        if (action === 'clear-device-filters') {
            deviceTypeFilter = 'All';
            deviceManufacturerFilter = 'All';
            render();
        }
        if (action === 'remove-device') {
            showDeleteConfirm(() => {
                config.devices.splice(index, 1);
                markDirty();
                render();
            });
        }
    });

    editor.addEventListener('dragstart', (event) => {
        const handle = event.target.closest('[data-drag-type]');
        if (!handle) return;
        draggedItem = {
            type: handle.dataset.dragType,
            index: parseInt(handle.dataset.index, 10)
        };
        event.dataTransfer.effectAllowed = 'move';
    });

    editor.addEventListener('dragover', (event) => {
        const row = event.target.closest('[data-drop-type]');
        if (!row || !draggedItem || row.dataset.dropType !== draggedItem.type) return;
        event.preventDefault();
        row.classList.add('drag-over');
    });

    editor.addEventListener('dragleave', (event) => {
        const row = event.target.closest('[data-drop-type]');
        if (row) row.classList.remove('drag-over');
    });

    editor.addEventListener('drop', (event) => {
        const row = event.target.closest('[data-drop-type]');
        if (!row || !draggedItem || row.dataset.dropType !== draggedItem.type) return;
        event.preventDefault();
        row.classList.remove('drag-over');

        const targetIndex = parseInt(row.dataset.index, 10);
        if (targetIndex === draggedItem.index) return;

        const items = draggedItem.type === 'plan' ? config[planSection] : config.perks;
        const [item] = items.splice(draggedItem.index, 1);
        items.splice(targetIndex, 0, item);
        draggedItem = null;
        markDirty();
        render();
    });

    editor.addEventListener('dragend', () => {
        draggedItem = null;
        editor.querySelectorAll('.drag-over').forEach(row => row.classList.remove('drag-over'));
    });

    document.querySelectorAll('.tabs button').forEach(button => {
        button.addEventListener('click', () => {
            activeTab = button.dataset.tab;
            render();
        });
    });

    document.getElementById('reloadBtn').addEventListener('click', () => {
        loadPricing().catch(error => setStatus(error.message));
    });

    document.getElementById('saveBtn').addEventListener('click', () => {
        savePricing().catch(error => setStatus(error.message));
    });

    document.getElementById('confirmCancelBtn').addEventListener('click', hideDeleteConfirm);
    document.getElementById('confirmDialog').addEventListener('click', (event) => {
        if (event.target.id === 'confirmDialog') hideDeleteConfirm();
    });
    document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
        if (pendingDelete) pendingDelete();
        hideDeleteConfirm();
    });

    const setValueForPath = (path) => {
        const parts = path.split('.');
        let target = config;
        parts.forEach(part => {
            target = target[part];
        });
        return target;
    };

    loadPricing().catch(error => setStatus(error.message));
})();
