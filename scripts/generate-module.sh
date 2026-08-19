#!/usr/bin/env bash
set -e

# ==============================================================================
# Module Generator Script for Express / TypeScript API
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
  echo "❌ Error: Module name is required."
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
  echo "⚠️ Warning: Directory '$MODULE_DIR' already exists."
  read -p "Do you want to overwrite it? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Operation cancelled."
    exit 0
  fi
fi

echo "🚀 Generating module '$MODULE_SLUG' in: $MODULE_DIR"
mkdir -p "$MODULE_DIR"

# ------------------------------------------------------------------------------
# 1. types.ts
# ------------------------------------------------------------------------------
cat <<EOF > "$MODULE_DIR/types.ts"
import type { z } from 'zod';
import type { ${CAMEL_CASE}IdParamSchema, create${PASCAL_CASE}Schema, list${PASCAL_CASE}QuerySchema, update${PASCAL_CASE}Schema } from './schema';

export type Create${PASCAL_CASE}Input = z.infer<typeof create${PASCAL_CASE}Schema>;
export type Update${PASCAL_CASE}Input = z.infer<typeof update${PASCAL_CASE}Schema>;
export type ${PASCAL_CASE}IdParam = z.infer<typeof ${CAMEL_CASE}IdParamSchema>;
export type List${PASCAL_CASE}Query = z.infer<typeof list${PASCAL_CASE}QuerySchema>;

export interface ${PASCAL_CASE}Response {
  id: number;
  title: string;
  description?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
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
import { NotFoundError } from '../../errors';
import type { Create${PASCAL_CASE}Input, List${PASCAL_CASE}Query, ${PASCAL_CASE}Response, Update${PASCAL_CASE}Input } from './types';

export const ${CAMEL_CASE}Service = {
  /**
   * List paginated items
   */
  async list({ page, limit }: List${PASCAL_CASE}Query) {
    // TODO: Implement database / business logic here
    const items: ${PASCAL_CASE}Response[] = [];
    const total = 0;

    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    };
  },

  /**
   * Get single item by ID
   */
  async get(id: number): Promise<${PASCAL_CASE}Response> {
    // TODO: Implement database lookup
    const item: ${PASCAL_CASE}Response | null = null;

    if (!item) {
      throw new NotFoundError('${PASCAL_CASE} not found');
    }

    return item;
  },

  /**
   * Create new item
   */
  async create(data: Create${PASCAL_CASE}Input): Promise<${PASCAL_CASE}Response> {
    // TODO: Implement business logic & database save
    return {
      id: Date.now(),
      title: data.title,
      description: data.description ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  },

  /**
   * Update existing item
   */
  async update(id: number, data: Update${PASCAL_CASE}Input): Promise<${PASCAL_CASE}Response> {
    const item = await this.get(id);

    // TODO: Implement update business logic & database save
    return {
      ...item,
      ...(data.title && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      updatedAt: new Date(),
    };
  },

  /**
   * Remove item by ID
   */
  async remove(id: number): Promise<void> {
    await this.get(id);
    // TODO: Implement database delete
  },
};
EOF

# ------------------------------------------------------------------------------
# 4. controller.ts (Clean Controller Abstraction)
# ------------------------------------------------------------------------------
cat <<EOF > "$MODULE_DIR/controller.ts"
import type { Request, Response } from 'express';
import { asyncHandler, ok } from '../../lib/http';
import { ${CAMEL_CASE}Service } from './service';
import type { Create${PASCAL_CASE}Input, List${PASCAL_CASE}Query, Update${PASCAL_CASE}Input } from './types';

export const ${CAMEL_CASE}Controller = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    const query = res.locals.query as List${PASCAL_CASE}Query;
    const { items, ...meta } = await ${CAMEL_CASE}Service.list(query);
    ok(res, items, 200, meta);
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const result = await ${CAMEL_CASE}Service.get(id);
    ok(res, result, 200);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as Create${PASCAL_CASE}Input;
    const result = await ${CAMEL_CASE}Service.create(body);
    ok(res, result, 201);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const body = req.body as Update${PASCAL_CASE}Input;
    const result = await ${CAMEL_CASE}Service.update(id, body);
    ok(res, result, 200);
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    await ${CAMEL_CASE}Service.remove(id);
    res.status(204).send();
  }),
};
EOF

# ------------------------------------------------------------------------------
# 5. routes.ts (Declarative Route Definitions)
# ------------------------------------------------------------------------------
cat <<EOF > "$MODULE_DIR/routes.ts"
import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { ${CAMEL_CASE}Controller } from './controller';
import { ${CAMEL_CASE}IdParamSchema, create${PASCAL_CASE}Schema, list${PASCAL_CASE}QuerySchema, update${PASCAL_CASE}Schema } from './schema';

export const ${CAMEL_CASE}Routes = Router();

${CAMEL_CASE}Routes.get('/', validate({ query: list${PASCAL_CASE}QuerySchema }), ${CAMEL_CASE}Controller.list);
${CAMEL_CASE}Routes.get('/:id', validate({ params: ${CAMEL_CASE}IdParamSchema }), ${CAMEL_CASE}Controller.get);
${CAMEL_CASE}Routes.post('/', validate({ body: create${PASCAL_CASE}Schema }), ${CAMEL_CASE}Controller.create);
${CAMEL_CASE}Routes.patch('/:id', validate({ params: ${CAMEL_CASE}IdParamSchema, body: update${PASCAL_CASE}Schema }), ${CAMEL_CASE}Controller.update);
${CAMEL_CASE}Routes.delete('/:id', validate({ params: ${CAMEL_CASE}IdParamSchema }), ${CAMEL_CASE}Controller.remove);
EOF

# ------------------------------------------------------------------------------
# 6. index.ts (Barrel Export)
# ------------------------------------------------------------------------------
cat <<EOF > "$MODULE_DIR/index.ts"
export * from './types';
export * from './schema';
export * from './service';
export * from './controller';
export * from './routes';
EOF

echo "✨ Module '${MODULE_SLUG}' generated successfully!"
echo ""
echo "Next step: Register '${CAMEL_CASE}Routes' in your express app (e.g. apps/api/src/app.ts):"
echo "--------------------------------------------------------"
echo "import { ${CAMEL_CASE}Routes } from './modules/${MODULE_SLUG}';"
echo ""
echo "api.use('/${MODULE_SLUG}s', ${CAMEL_CASE}Routes);"
echo "--------------------------------------------------------"

