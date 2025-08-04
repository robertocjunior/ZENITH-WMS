CREATE OR REPLACE TRIGGER TRG_AD_IBXEND_SET_CODPROD
BEFORE INSERT OR UPDATE OF CODARM, SEQEND ON AD_IBXEND
FOR EACH ROW
DECLARE
  -- Variável para armazenar o código do produto encontrado
  v_codprod NUMBER;
BEGIN
  -- Se os campos chave não forem nulos, executa a busca
  IF :NEW.CODARM IS NOT NULL AND :NEW.SEQEND IS NOT NULL THEN
    BEGIN
      -- Busca o CODPROD na tabela AD_CADEND usando as chaves da linha que está sendo inserida/atualizada
      SELECT CODPROD
      INTO v_codprod
      FROM AD_CADEND
      WHERE CODARM = :NEW.CODARM
        AND SEQEND = :NEW.SEQEND;

      -- Atribui o valor encontrado ao campo CODPROD da linha nova/atualizada
      :NEW.CODPROD := v_codprod;

    EXCEPTION
      -- Se a busca não encontrar nenhum registro, a exceção NO_DATA_FOUND é lançada.
      -- Nós a capturamos para evitar um erro e definimos o CODPROD como nulo (ou 0, se preferir).
      WHEN NO_DATA_FOUND THEN
        :NEW.CODPROD := NULL;
    END;
  ELSE
    -- Se os campos chave forem nulos, define o CODPROD como nulo também.
    :NEW.CODPROD := NULL;
  END IF;
END;