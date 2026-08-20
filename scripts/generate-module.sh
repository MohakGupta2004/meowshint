#!/usr/bin/env bash
set -e

# ==============================================================================
# Module Generator Script for Elysia / TypeScript API
# ==============================================================================
# Usage:
#   ./scripts/generate-module.sh <module-name> [output-directory]
#
# Examples:
#   ./scripts/generate-module.sh post
#   ./scripts/generate-module.sh product apps/api/src/modules
#   cd apps/api && ../../scripts/generate-module.sh product
# ==============================================================================

RAW_NAME="$1"
CUSTOM_TARGET_DIR="$2"

if [ -z "$RAW_NAME" ]; then
  echo "Error: Module name is required."
  echo "Usage: $0 <module-name> [output-directory]"
  echo "Example: $0 product"
  exit 1
fi

# Sanitize module name: lowercase, strip non-alphanumeric except hyphen/underscore
MODULE_SLUG=$(echo "$RAW_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_-]//g')

# Convert slug to camelCase & PascalCase
# e.g., product-item -> productItem / ProductItem
CAMEL_CASE=$(echo "$MODULE_SLUG" | awk -F'[-_]' '{out=$1; for(i=2;i<=NF;i++) out=out toupper(substr($i,1,1)) substr($i,2); print out}')
PASCAL_CASE=$(echo "$CAMEL_CASE" | awk '{print toupper(substr($0,1,1)) substr($0,2)}')

# Determine Target Directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CURRENT_DIR="$(pwd)"

if [ -n "$CUSTOM_TARGET_DIR" ]; then
  MODULE_DIR="$CUSTOM_TARGET_DIR/$MODULE_SLUG"
elif [ -d "$CURRENT_DIR/src/modules" ]; then
  # Running from within an app directory like apps/api
  MODULE_DIR="$CURRENT_DIR/src/modules/$MODULE_SLUG"
elif [ -d "$CURRENT_DIR/apps/api/src/modules" ]; then
  # Running from root directory
  MODULE_DIR="$CURRENT_DIR/apps/api/src/modules/$MODULE_SLUG"
else
  # Fallback to relative ./src/modules
  MODULE_DIR="$CURRENT_DIR/src/modules/$MODULE_SLUG"
fi

if [ -d "$MODULE_DIR" ]; then
  echo "Warning: Directory '$MODULE_DIR' already exists."
  read -p "Do you want to overwrite it? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Operation cancelled."
    exit 0
  fi
fi

echo "Generating module '$MODULE_SLUG' in: $MODULE_DIR"
mkdir -p "$MODULE_DIR"

# ------------------------------------------------------------------------------
# 1. types.ts
# ------------------------------------------------------------------------------
cat <<EOF > "$MODULE_DIR/types.ts"
import type { z } from 'zod';
import type { create${PASCAL_CASE}Schema, list${PASCAL_CASE}QuerySchema, update${PASCAL_CASE}Schema, ${CAMEL_CASE}IdParamSchema } from './schema';

export type Create${PASCAL_CASE}Input = z.infer<typeof create${PASCAL_CASE}Schema>;
export type Update${PASCAL_CASE}Input = z.infer<typeof update${PASCAL_CASE}Schema>;
export type ${PASCAL_CASE}IdParam = z.infer<typeof ${CAMEL_CASE}IdParamSchema>;
export type List${PASCAL_CASE}Query = z.infer<typeof list${PASCAL_CASE}QuerySchema>;
EOF

# ------------------------------------------------------------------------------
# 2. schema.ts
# ------------------------------------------------------------------------------
cat <<EOF > "$MODULE_DIR/schema.ts"
import { z } from 'zod';

export const create${PASCAL_CASE}Schema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(120),
  description: z.string().trim().optional(),
});

export const update${PASCAL_CASE}Schema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, 'At least one field must be provided to update');

export const ${CAMEL_CASE}IdParamSchema = z.object({
  id: z.coerce.number().int().positive('ID must be a positive integer'),
});

export const list${PASCAL_CASE}QuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
EOF

# ------------------------------------------------------------------------------
# 3. service.ts (Business Logic)
# ------------------------------------------------------------------------------
cat <<EOF > "$MODULE_DIR/service.ts"
import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../errors';
import type { Create${PASCAL_CASE}Input, List${PASCAL_CASE}Query, Update${PASCAL_CASE}Input } from './types';

const select = {
  id: true,
  title: true,
  description: true,
  createdAt: true,
  updatedAt: true,
};

export const ${CAMEL_CASE}Service = {
  async list({ page, limit }: List${PASCAL_CASE}Query) {
    const [items, total] = await prisma.\$transaction([
      prisma.${CAMEL_CASE}.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { id: 'asc' },
        select,
      }),
      prisma.${CAMEL_CASE}.count(),
    ]);
    return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
  },

  async get(id: number) {
    const item = await prisma.${CAMEL_CASE}.findUnique({
      where: { id },
      select,
    });
    if (!item) throw new NotFoundError('${PASCAL_CASE} not found');
    return item;
  },

  async create(data: Create${PASCAL_CASE}Input) {
    return prisma.${CAMEL_CASE}.create({
      data: {
        title: data.title.trim(),
        description: data.description ?? null,
      },
      select,
    });
  },

  async update(id: number, data: Update${PASCAL_CASE}Input) {
    await this.get(id);
    return prisma.${CAMEL_CASE}.update({
      where: { id },
      data: {
        ...(data.title && { title: data.title.trim() }),
        ...(data.description !== undefined && { description: data.description }),
      },
      select,
    });
  },

  async remove(id: number) {
    await this.get(id);
    await prisma.${CAMEL_CASE}.delete({ where: { id } });
  },
};
EOF

# ------------------------------------------------------------------------------
# 4. routes.ts (Elysia Routes with TypeBox validators)
# ------------------------------------------------------------------------------
cat <<EOF > "$MODULE_DIR/routes.ts"
import { Elysia, t } from 'elysia';

import { ${CAMEL_CASE}Service } from './service';
import type { Create${PASCAL_CASE}Input, List${PASCAL_CASE}Query, Update${PASCAL_CASE}Input } from './types';

export const ${CAMEL_CASE}Routes = new Elysia({ prefix: '/${MODULE_SLUG}s' })
  .get(
    '/',
    async ({ query }) => {
      const { page = 1, limit = 20 } = query as List${PASCAL_CASE}Query;
      const { items, ...meta } = await ${CAMEL_CASE}Service.list({ page, limit });
      return { success: true, data: items, meta };
    },
    {
      query: t.Object({
        page: t.Optional(t.Number({ minimum: 1 })),
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
      }),
    }
  )
  .get(
    '/:id',
    async ({ params }) => {
      const id = Number(params.id);
      const item = await ${CAMEL_CASE}Service.get(id);
      return { success: true, data: item };
    },
    {
      params: t.Object({
        id: t.Number({ minimum: 1 }),
      }),
    }
  )
  .post(
    '/',
    async ({ body }) => {
      const result = await ${CAMEL_CASE}Service.create(body as Create${PASCAL_CASE}Input);
      return { success: true, data: result };
    },
    {
      body: t.Object({
        title: t.String({ minLength: 1, maxLength: 120 }),
        description: t.Optional(t.String()),
      }),
    }
  )
  .patch(
    '/:id',
    async ({ params, body }) => {
      const id = Number(params.id);
      const result = await ${CAMEL_CASE}Service.update(id, body as Update${PASCAL_CASE}Input);
      return { success: true, data: result };
    },
    {
      params: t.Object({
        id: t.Number({ minimum: 1 }),
      }),
      body: t.Object({
        title: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
        description: t.Optional(t.Nullable(t.String())),
      }),
    }
  )
  .delete(
    '/:id',
    async ({ params }) => {
      const id = Number(params.id);
      await ${CAMEL_CASE}Service.remove(id);
      return new Response(null, { status: 204 });
    },
    {
      params: t.Object({
        id: t.Number({ minimum: 1 }),
      }),
    }
  );
EOF

# ------------------------------------------------------------------------------
# 5. index.ts (Barrel Export)
# ------------------------------------------------------------------------------
cat <<EOF > "$MODULE_DIR/index.ts"
export * from './types';
export * from './schema';
export * from './service';
export * from './routes';
EOF

echo "Module '${MODULE_SLUG}' generated successfully!"
echo ""
echo "Next step: Register '${CAMEL_CASE}Routes' in your Elysia app (e.g. apps/api/src/app.ts):"
echo "--------------------------------------------------------"
echo "import { ${CAMEL_CASE}Routes } from './modules/${MODULE_SLUG}';"
echo ""
echo "app.use(${CAMEL_CASE}Routes);"
echo "--------------------------------------------------------"
