import { Factory, Sequence } from '@stratal/framework/factory'

interface User {
  id: string
  email: string
  name: string
  role: 'user' | 'admin'
  emailVerified: boolean
  createdAt: string
}

type UserCreateInput = Omit<User, 'id' | 'createdAt'>

const emailSequence = new Sequence((n) => `user${n}@example.com`)

export class UserFactory extends Factory<User, UserCreateInput> {
  protected model = 'user'

  protected definition(): UserCreateInput {
    return {
      email: emailSequence.next(),
      name: this.faker.person.fullName(),
      role: 'user',
      emailVerified: true,
    }
  }

  admin() {
    return this.state(() => ({ role: 'admin' as const }))
  }

  unverified() {
    return this.state(() => ({ emailVerified: false }))
  }

  withEmail(email: string) {
    return this.state(() => ({ email }))
  }
}
