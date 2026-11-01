interface CollectionNode {
  id?: string;
}

interface ProductCollectionsData {
  product: {
    collections: {
      nodes: CollectionNode[];
      pageInfo: {
        hasNextPage: boolean;
        endCursor?: string | null;
      };
    };
  } | null;
}

interface CollectionQueryResult {
  data?: ProductCollectionsData;
  errors?: unknown;
}

const PRODUCT_COLLECTIONS_QUERY = `query ProductCollections($id: ID!, $cursor: String) {
  product(id: $id) {
    collections(first: 100, after: $cursor) {
      nodes {
        id
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}`;

const MAX_COLLECTION_PAGES = 20;

export async function loadProductCollectionIds(
  request: (
    query: string,
    options: { variables: { id: string; cursor?: string } }
  ) => Promise<CollectionQueryResult>,
  productId: string
): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_COLLECTION_PAGES; page += 1) {
    const result = await request(PRODUCT_COLLECTIONS_QUERY, {
      variables: cursor ? { id: productId, cursor } : { id: productId },
    });

    if (result.errors) {
      throw new Error("Product collection lookup failed");
    }

    const product = result.data?.product;
    if (!product) {
      return [];
    }

    for (const node of product.collections.nodes) {
      if (typeof node.id === "string" && node.id.length > 0) {
        ids.push(node.id);
      }
    }

    if (!product.collections.pageInfo.hasNextPage) {
      return ids;
    }

    const nextCursor = product.collections.pageInfo.endCursor;
    if (typeof nextCursor !== "string" || nextCursor.length === 0) {
      throw new Error("Product collection lookup failed");
    }
    cursor = nextCursor;
  }

  return ids;
}
