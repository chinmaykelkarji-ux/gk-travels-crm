import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const passwordHash = await bcrypt.hash('admin123', 10)

  await prisma.user.update({
    where: {
      email: 'admin@gktravels.com',
    },
    data: {
      passwordHash,
    },
  })

  console.log('Password reset successful')
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
  })