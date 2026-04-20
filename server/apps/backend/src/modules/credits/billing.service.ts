import { Injectable } from "@nestjs/common";

export interface BillingResult {
	success: boolean;
	creditsDeducted: number;
	remainingBalance: number;
	insufficientBalance: boolean;
}

/**
 * Stub BillingService for open-source version.
 * Billing is disabled - all operations succeed with no deduction.
 */
@Injectable()
export class BillingService {
	async deductByTokens(
		_userId: number,
		_totalTokens: number,
		_taskId: number,
		_taskExecutionId: number,
	): Promise<BillingResult> {
		return {
			success: true,
			creditsDeducted: 0,
			remainingBalance: -1,
			insufficientBalance: false,
		};
	}

	async getBalance(_userId: number) {
		return { remaining: 999999 };
	}
}
