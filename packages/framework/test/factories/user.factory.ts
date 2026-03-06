import { Factory } from '@stratal/framework/factory'
import type { UserCreateArgs } from '../zenstack/input'
import type { User } from '../zenstack/models'

type UserCreateInput = UserCreateArgs['data']

export class UserFactory extends Factory<User, UserCreateInput> {
  protected model = 'user'

  protected definition(): UserCreateInput {
    return {
      id: this.faker.string.alphanumeric(25),
      email: this.faker.internet.email(),
      name: this.faker.person.fullName(),
      emailVerified: true,
      role: 'user',
    }
  }

  unverified() {
    return this.state(() => ({ emailVerified: false }))
  }

  admin() {
    return this.state(() => ({ role: 'admin' }))
  }

  withEmail(email: string) {
    return this.state(() => ({ email }))
  }
}
