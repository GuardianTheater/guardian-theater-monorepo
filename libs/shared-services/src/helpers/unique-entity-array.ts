export default function uniqueEntityArray(
  entityArray: any[],
  key: string | string[],
) {
  const uniqueEntities = [];
  if (entityArray.length) {
    const uniqueValues = Array.from(
      new Set(
        entityArray.map(entity => {
          if (Array.isArray(key)) {
            let value = entity;
            for (let i = 0; i < key.length; i++) {
              value = value[key[i]];
            }
            return value;
          } else {
            return entity[key];
          }
        }),
      ),
    );
    for (let i = 0; i < uniqueValues.length; i++) {
      const value = uniqueValues[i];
      for (let j = 0; j < entityArray.length; j++) {
        const entity = entityArray[j];
        if (Array.isArray(key)) {
          let val = entity;
          for (let k = 0; k < key.length; k++) {
            val = val[key[k]];
          }
          if (val === value) {
            uniqueEntities.push(entity);
            break;
          }
        } else {
          if (entity[key] === value) {
            uniqueEntities.push(entity);
            break;
          }
        }
      }
    }
  }
  return uniqueEntities;
}
