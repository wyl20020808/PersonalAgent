/** Limits are optional and independent of planning preferences. Tokens are checked at call boundaries. */
export type ResourceLimits={activeMs:number|null;tokens:number|null};
export const resourceLimitsSchema={type:'object',additionalProperties:false,required:['activeMs','tokens'],properties:{activeMs:{type:['integer','null'],minimum:1000,maximum:604800000},tokens:{type:['integer','null'],minimum:1,maximum:1000000000}}};
