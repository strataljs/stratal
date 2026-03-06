import type { Adapter, Model } from 'casbin'

import { Helper } from 'casbin'

/**
 * Minimal interface for the database client used by the adapter.
 * The actual DatabaseService extends ZenStackClient which provides these methods
 * when the schema includes a `casbinRule` model.
 */
export interface CasbinDbClient {
  casbinRule: {
    findMany(args?: { where?: Record<string, unknown> }): Promise<unknown[]>
    create(args: { data: CasbinRuleCreateInput }): Promise<unknown>
    createMany(args: { data: CasbinRuleCreateInput[] }): Promise<unknown>
    deleteMany(args: { where: CasbinRuleCreateInput }): Promise<{ count: number }>
  }
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<unknown>
}

interface CasbinRuleCreateInput {
  ptype: string
  v0?: string | null
  v1?: string | null
  v2?: string | null
  v3?: string | null
  v4?: string | null
  v5?: string | null
}

interface CasbinRuleRecord {
  id: number
  ptype: string
  v0: string | null
  v1: string | null
  v2: string | null
  v3: string | null
  v4: string | null
  v5: string | null
}

/**
 * Custom ZenStack adapter for Casbin that works with Cloudflare Workers.
 *
 * Based on the original casbin-prisma-adapter but modified to:
 * - Work with ZenStack v3 ORM clients
 * - Avoid bundling errors in Cloudflare Workers
 * - Accept pre-connected ZenStack clients (request-scoped)
 */
export class CustomZenStackAdapter implements Adapter {
  #db: CasbinDbClient

  filtered = false

  public isFiltered(): boolean {
    return this.filtered
  }

  public enableFiltered(enabled: boolean): void {
    this.filtered = enabled
  }

  constructor(db: CasbinDbClient) {
    this.#db = db
  }

  async loadPolicy(model: Model): Promise<void> {
    const lines = await this.#db.casbinRule.findMany()

    for (const line of lines) {
      this.#loadPolicyLine(line as CasbinRuleRecord, model)
    }
  }

  async loadFilteredPolicy(
    model: Model,
    filter: Record<string, string[][]>
  ): Promise<void> {
    const whereFilter = Object.keys(filter)
      .map((ptype) => {
        const policyPatterns = filter[ptype]
        return policyPatterns.map((policyPattern) => {
          return {
            ptype,
            ...(policyPattern[0] && { v0: policyPattern[0] }),
            ...(policyPattern[1] && { v1: policyPattern[1] }),
            ...(policyPattern[2] && { v2: policyPattern[2] }),
            ...(policyPattern[3] && { v3: policyPattern[3] }),
            ...(policyPattern[4] && { v4: policyPattern[4] }),
            ...(policyPattern[5] && { v5: policyPattern[5] }),
          }
        })
      })
      .flat()
    const lines = await this.#db.casbinRule.findMany({
      where: {
        OR: whereFilter,
      },
    })
    lines.forEach((line) => this.#loadPolicyLine(line as CasbinRuleRecord, model))
    this.enableFiltered(true)
  }

  async savePolicy(model: Model): Promise<boolean> {
    await this.#db.$executeRawUnsafe('DELETE FROM casbin_rule')

    const lines: CasbinRuleCreateInput[] = []

    const savePolicyType = (ptype: string): void => {
      const astMap = model.model.get(ptype)
      if (astMap) {
        for (const [ptype, ast] of astMap) {
          for (const rule of ast.policy) {
            const line = this.#savePolicyLine(ptype, rule)
            lines.push(line)
          }
        }
      }
    }

    savePolicyType('p')
    savePolicyType('g')

    await this.#db.casbinRule.createMany({ data: lines })

    return true
  }

  async addPolicy(_sec: string, ptype: string, rule: string[]): Promise<void> {
    const line = this.#savePolicyLine(ptype, rule)
    await this.#db.casbinRule.create({ data: line })
  }

  async addPolicies(
    _sec: string,
    ptype: string,
    rules: string[][]
  ): Promise<void> {
    const processes: Promise<CasbinRuleRecord>[] = []
    for (const rule of rules) {
      const line = this.#savePolicyLine(ptype, rule)
      const p = this.#db.casbinRule.create({ data: line }) as Promise<CasbinRuleRecord>
      processes.push(p)
    }

    await Promise.all(processes)
  }

  async removePolicy(
    _sec: string,
    ptype: string,
    rule: string[]
  ): Promise<void> {
    const line = this.#savePolicyLine(ptype, rule)
    await this.#db.casbinRule.deleteMany({ where: line })
  }

  async removePolicies(
    _sec: string,
    ptype: string,
    rules: string[][]
  ): Promise<void> {
    const processes: Promise<{ count: number }>[] = []
    for (const rule of rules) {
      const line = this.#savePolicyLine(ptype, rule)
      const p = this.#db.casbinRule.deleteMany({ where: line })
      processes.push(p)
    }

    await Promise.all(processes)
  }

  async removeFilteredPolicy(
    _sec: string,
    ptype: string,
    fieldIndex: number,
    ...fieldValues: string[]
  ): Promise<void> {
    const line: CasbinRuleCreateInput = { ptype }

    const idx = fieldIndex + fieldValues.length
    if (fieldIndex <= 0 && 0 < idx) {
      line.v0 = fieldValues[0 - fieldIndex]
    }
    if (fieldIndex <= 1 && 1 < idx) {
      line.v1 = fieldValues[1 - fieldIndex]
    }
    if (fieldIndex <= 2 && 2 < idx) {
      line.v2 = fieldValues[2 - fieldIndex]
    }
    if (fieldIndex <= 3 && 3 < idx) {
      line.v3 = fieldValues[3 - fieldIndex]
    }
    if (fieldIndex <= 4 && 4 < idx) {
      line.v4 = fieldValues[4 - fieldIndex]
    }
    if (fieldIndex <= 5 && 5 < idx) {
      line.v5 = fieldValues[5 - fieldIndex]
    }

    await this.#db.casbinRule.deleteMany({ where: line })
  }

  async close(): Promise<void> {
    // No-op: ZenStack uses pg.Pool for connection management
  }

  static newAdapter(db: CasbinDbClient): CustomZenStackAdapter {
    const adapter = new CustomZenStackAdapter(db)
    return adapter
  }

  #loadPolicyLine = (line: CasbinRuleRecord, model: Model): void => {
    const result =
      line.ptype +
      ', ' +
      [line.v0, line.v1, line.v2, line.v3, line.v4, line.v5]
        .filter((n) => n)
        .join(', ')
    Helper.loadPolicyLine(result, model)
  }

  #savePolicyLine = (
    ptype: string,
    rule: string[]
  ): CasbinRuleCreateInput => {
    const line: CasbinRuleCreateInput = { ptype }

    if (rule.length > 0) {
      line.v0 = rule[0]
    }
    if (rule.length > 1) {
      line.v1 = rule[1]
    }
    if (rule.length > 2) {
      line.v2 = rule[2]
    }
    if (rule.length > 3) {
      line.v3 = rule[3]
    }
    if (rule.length > 4) {
      line.v4 = rule[4]
    }
    if (rule.length > 5) {
      line.v5 = rule[5]
    }

    return line
  }
}
