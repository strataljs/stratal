export default {
  createTransport: () => ({
    sendMail: () => Promise.resolve({}),
  }),
}

export const createTransport = () => ({
  sendMail: () => Promise.resolve({}),
})
