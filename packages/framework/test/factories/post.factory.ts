import { Factory } from '@stratal/framework/factory'
import type { PostCreateArgs } from '../zenstack/input'
import type { Post } from '../zenstack/models'

type PostCreateInput = PostCreateArgs['data']

export class PostFactory extends Factory<Post, PostCreateInput> {
  protected model = 'post'

  protected definition(): PostCreateInput {
    return {
      id: this.faker.string.alphanumeric(25),
      title: this.faker.lorem.sentence(),
      content: this.faker.lorem.paragraphs(2),
      published: false,
      authorId: '',
    }
  }

  published() {
    return this.state(() => ({ published: true }))
  }

  forAuthor(userId: string) {
    return this.state(() => ({ authorId: userId }))
  }
}
