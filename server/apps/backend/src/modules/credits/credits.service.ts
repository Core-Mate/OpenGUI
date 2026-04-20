import { Injectable } from "@nestjs/common";

export interface BalanceResponseDto {
	remaining: number;
}

/**
 * Stub CreditsService for open-source version.
 * Credits system is disabled - users always have unlimited balance.
 */
@Injectable()
export class CreditsService {
	async getBalance(_userId: number): Promise<BalanceResponseDto> {
		return { remaining: 999999 };
	}

	async deductCredits(
		_userId: number,
		_dto: { amount: number; taskId: string; taskTitle: string },
		_allowNegative = false,
	): Promise<{ success: boolean; remainingBalance: number }> {
		return { success: true, remainingBalance: 999999 };
	}
}
