import { Test, type TestingModule } from '@stratal/testing'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { DatabaseModule } from '../../src/database/database.module'
import { schema } from '../zenstack/schema'

describe('Lazy Database Service Creation', () => {
  let module: TestingModule
  const dialectSpy = vi.fn()

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        DatabaseModule.forRoot({
          default: 'main',
          connections: [{ name: 'main', schema, dialect: dialectSpy }],
        }),
      ],
    }).compile()
  })

  afterAll(async () => {
    await module.close()
  })

  it('does not create database services during module initialization', () => {
    expect(dialectSpy).not.toHaveBeenCalled()
  })
})
