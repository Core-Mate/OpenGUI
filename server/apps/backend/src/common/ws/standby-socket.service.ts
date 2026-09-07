import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { AppLogger } from "../log";
import type { StandbySocket } from "./types";

/**
 *
 */
@Injectable()
export class StandbySocketService implements OnModuleDestroy {
	/** deviceId → socket */
	private readonly devices = new Map<string, StandbySocket>();

	private readonly socketToDevice = new Map<string, string>();

	constructor(private readonly logger: AppLogger) {
		this.logger.setContext(StandbySocketService.name);
	}

	onModuleDestroy() {
		this.devices.clear();
		this.socketToDevice.clear();
	}

	/**
	 */
	registerDevice(
		deviceId: string,
		socket: StandbySocket,
		deviceName?: string,
	): void {

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
	 */
	getOnlineDevice(): StandbySocket | null {
		for (const [, socket] of this.devices) {
			if (socket.connected) return socket;
		}
		return null;
	}

	getOnlineDeviceById(deviceId: string): StandbySocket | null {
		const socket = this.devices.get(deviceId);
		return socket?.connected ? socket : null;
	}

	/**
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
	 */
	hasOnlineDevice(): boolean {
		return this.getOnlineDevice() !== null;
	}
}
