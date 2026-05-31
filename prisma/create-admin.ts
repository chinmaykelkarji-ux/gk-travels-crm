import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const email = 'admin@gktravels.local'
  const password = 'admin123'

  const existing = await prisma.user.findUnique({
    where: { email },
  })

  if (existing) {
    console.log('User already exists')
    return
  }

  const passwordHash = await bcrypt.hash(password, 10)

  const user = await prisma.user.create({
    data: {
      name: 'Chinmay',
      email,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
    },
  })

  console.log('Admin created successfully')
  console.log(user)
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
  })