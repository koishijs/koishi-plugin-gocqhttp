export type Device = DeviceNumber | DeviceString | DeviceConfig;
type DeviceNumber = 0 | 1 | 2 | 3 | 4 | "0" | "1" | "2" | "3" | "4";
type DeviceString = "iPad" | "安卓" | "Android" | "Watch" | "MacOS" | "企点";
type DeviceConfig = {
    product?: string;
    protocol?: number;
    display?: string;
    device?: string;
    board?: string;
    model?: string;
    finger_print?: string;
    boot_id?: string;
    proc_version?: string;
    imei?: string;
    brand?: string;
    bootloader?: string;
    sim_info?: string;
    os_type?: string;
    mac_address?: string;
    ip_address?: number[];
    wifi_bssid?: string;
    wifi_ssid?: string;
    imsi_md5?: string;
    vendor_name?: string;
    android_id?: string;
    apn?: string;
    vendor_os_name?: string;
    version?: {
        incremental?: string;
        release?: string;
        codename?: string;
        sdk?: number;
    };
};

export type DeviceInfo = {
    product: string;
    protocol: number;
    display: string;
    device: string;
    board: string;
    model: string;
    finger_print: string;
    boot_id: string;
    proc_version: string;
    imei: string;
    brand: string;
    bootloader: string;
    sim_info: string;
    os_type: string;
    mac_address: string;
    ip_address: number[];
    wifi_bssid: string;
    wifi_ssid: string;
    imsi_md5: string;
    vendor_name: string;
    android_id: string;
    apn: string;
    vendor_os_name: string;
    version: {
        incremental: string;
        release: string;
        codename: string;
        sdk: number;
    };
};
export function parseProtocol(device: Device) {
    if (typeof device === "number") {
        return device;
    }
    if (typeof device === "string") {
        const NUMBER = parseInt(device);
        if (!Number.isNaN(NUMBER)) return NUMBER;
        switch (device) {
            case "iPad":
                return 0;
            case "安卓":
            case "Android":
                return 1;
            case "Watch":
                return 2;
            case "MacOS":
                return 3;
            case "企点":
                return 4;
        }
    }
    return 0;
}
const isObject = (el: any) =>
    Object.prototype.toString.call(el) === "[object Object]";

export function equalsConfig(pre: DeviceInfo, cur: DeviceConfig = {}) {
    for (const [key, value] of Object.entries(pre)) {
        const el = cur[key];
        if (el) {
            if (typeof value === "number" || typeof value === "string") {
                if (el !== value) {
                    return false;
                }
            }
            if (typeof value === "object") {
                if (Array.isArray(value)) {
                    return value.reduce((p, c, i) => {
                        if (c !== el[i]) {
                            return false;
                        }
                        return p;
                    }, true);
                }
                if (isObject(value)) {
                    for (const [k, v] of Object.entries(value)) {
                        const r = el[k];
                        if (r && v !== r) {
                            return false;
                        }
                    }
                }
            }
        }
    }
    return true;
}
export function setConfig(pre: DeviceInfo, cur: DeviceConfig = {}) {
    for (const [key, value] of Object.entries(pre)) {
        const el = cur[key];
        if (el) {
            if (typeof value === "number" || typeof value === "string") {
                if (key === "protocol" && el !== value) {
                    pre[key] = parseProtocol(el);
                } else if (el !== value) {
                    pre[key] = el;
                }
            }
            if (typeof value === "object") {
                let result;
                if (Array.isArray(value)) {
                    result = value.reduce((p, c, i) => {
                        if (c !== el[i]) {
                            return true;
                        }
                        return p;
                    }, false);
                }
                if (isObject(value)) {
                    result = Object.entries(value).reduce((p, c, i) => {
                        if (c !== el[i]) {
                            return true;
                        }
                        return p;
                    }, false);
                }
                if (result) {
                    pre[key] = el;
                }
            }
        }
    }
}
