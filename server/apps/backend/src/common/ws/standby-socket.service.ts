import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { AppLogger } from "../log";
import type { StandbySocket } from "./types";

/**
 * 设备待命注册表
 *
 * 管理通过 /standby namespace 连接的待命设备。
 * 使用内存 Map（与 ExecutionSocketService 同理：dispatch 需要直接 socket 引用）。
 */
@Injectable()
export class StandbySocketService implements OnModuleDestroy {
	/** deviceId → socket */
	private readonly devices = new Map<string, StandbySocket>();

	/** socketId → deviceId（反向索引） */
	private readonly socketToDevice = new Map<string, string>();

	constructor(private readonly logger: AppLogger) {
		this.logger.setContext(StandbySocketService.name);
	}

	onModuleDestroy() {
		this.devices.clear();
		this.socketToDevice.clear();
	}

	/**
	 * 注册待命设备
	 */
	registerDevice(
		deviceId: string,
		socket: StandbySocket,
		deviceName?: string,
	): void {
		// 如果同一设备已有旧连接，先断开
		if (this.devices.has(deviceId)) {
			const old = this.devices.get(deviceId)!;
			this.logger.warn(
				`Replacing standby connection for device ${deviceId}: old=${old.id}, new=${socket.id}`,
			);
			this.socketToDevice.delete(old.id);
			try {
				old.disconnect(true);
			} catch (e) {
				this.logger.warn(
					`Failed to disconnect old standby socket ${old.id}: ${(e as Error).message}`,
				);
			}
		}

		socket.deviceId = deviceId;
		socket.deviceName = deviceName;
		this.devices.set(deviceId, socket);
		this.socketToDevice.set(socket.id, deviceId);

		this.logger.log(
			`Device registered: ${deviceId}${deviceName ? ` (${deviceName})` : ""}, socket=${socket.id}`,
		);
	}

	/**
	 * 移除待命设备
	 */
	unregisterDevice(socketId: string): string | undefined {
		const deviceId = this.socketToDevice.get(socketId);
		if (deviceId) {
			this.devices.delete(deviceId);
			this.socketToDevice.delete(socketId);
			this.logger.log(`Device unregistered: ${deviceId}`);
		}
		return deviceId;
	}

	/**
	 * 获取一台在线待命设备（单用户模式下取第一台）
	 */
	getOnlineDevice(): StandbySocket | null {
		for (const [, socket] of this.devices) {
			if (socket.connected) return socket;
		}
		return null;
	}

	/**
	 * 获取所有在线设备信息
	 */
	getOnlineDevices(): Array<{
		deviceId: string;
		deviceName?: string;
	}> {
		const result: Array<{ deviceId: string; deviceName?: string }> = [];
		for (const [deviceId, socket] of this.devices) {
			if (socket.connected) {
				result.push({ deviceId, deviceName: socket.deviceName });
			}
		}
		return result;
	}

	/**
	 * 检查是否有设备在线
	 */
	hasOnlineDevice(): boolean {
		return this.getOnlineDevice() !== null;
	}
}
