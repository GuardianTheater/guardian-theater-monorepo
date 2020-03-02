export default function uniqueEntityArray(entityArray: any[], key: string) {
  const uniqueEntities = [];
  if (entityArray.length) {
    const uniqueValues = Array.from(
      new Set(entityArray.map(entity => entity[key])),
    );
    for (let i = 0; i < uniqueValues.length; i++) {
      const value = uniqueValues[i];
      for (let j = 0; j < entityArray.length; j++) {
        const entity = entityArray[j];
        if (entity[key] === value) {
          uniqueEntities.push(entity);
          break;
        }
      }
    }
  }
  return uniqueEntities;
}
